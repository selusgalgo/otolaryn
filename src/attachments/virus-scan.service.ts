import * as net from 'node:net';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const CHUNK_BYTES = 64 * 1024;
const SCAN_TIMEOUT_MS = 30_000;

// Análisis antivirus con ClamAV por su socket unix (protocolo INSTREAM): el
// archivo se envía en trozos al demonio `clamd`, que ya está cargado en memoria
// — sin lanzar un proceso por archivo. Se activa con ATTACHMENTS_CLAMAV_SOCKET
// (p.ej. /run/clamav/clamd.ctl); sin ella no se analiza (desarrollo y tests).
// Si está activado y el análisis no se puede hacer, el archivo se RECHAZA: es
// preferible no guardar un adjunto que guardarlo sin comprobar.
@Injectable()
export class VirusScanService {
  private readonly logger = new Logger(VirusScanService.name);
  private readonly socketPath: string | undefined;

  constructor(config: ConfigService) {
    this.socketPath =
      config.get<string>('ATTACHMENTS_CLAMAV_SOCKET') || undefined;
  }

  get enabled(): boolean {
    return this.socketPath !== undefined;
  }

  async assertClean(data: Buffer): Promise<void> {
    if (!this.socketPath) return;
    let reply: string;
    try {
      reply = await this.scan(this.socketPath, data);
    } catch (err) {
      this.logger.error(
        `ClamAV no disponible: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException(
        'No se pudo analizar el archivo en este momento. Inténtalo de nuevo en unos minutos.',
      );
    }
    if (/FOUND\s*$/.test(reply.replace(/\0/g, '').trim())) {
      this.logger.warn(
        `Adjunto rechazado por el antivirus: ${reply.replace(/\0/g, '').trim()}`,
      );
      throw new UnprocessableEntityException(
        'El archivo parece contener un virus y no se ha guardado.',
      );
    }
    if (!/\bOK\s*$/.test(reply.replace(/\0/g, '').trim())) {
      this.logger.error(`Respuesta inesperada de ClamAV: ${reply}`);
      throw new ServiceUnavailableException(
        'No se pudo analizar el archivo en este momento. Inténtalo de nuevo en unos minutos.',
      );
    }
  }

  private scan(socketPath: string, data: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(socketPath);
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('tiempo de espera agotado'));
      }, SCAN_TIMEOUT_MS);
      const done = (err?: Error) => {
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(Buffer.concat(chunks).toString('utf8'));
      };

      socket.on('error', done);
      socket.on('data', (c) => chunks.push(c));
      socket.on('close', () => done());
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let i = 0; i < data.length; i += CHUNK_BYTES) {
          const chunk = data.subarray(i, i + CHUNK_BYTES);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length);
          socket.write(size);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4)); // longitud 0 = fin del archivo
      });
    });
  }
}
