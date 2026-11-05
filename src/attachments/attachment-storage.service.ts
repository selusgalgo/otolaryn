import { randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Guarda los adjuntos en una carpeta del servidor, no en la base de datos: la
// base de datos solo lleva los metadatos (nombre, tipo, tamaño...) y la
// `storage_key` relativa a esta carpeta. Cada archivo se guarda con un UUID como
// nombre, nunca con el que mandó el cliente, y la carpeta es privada del usuario
// de la aplicación (0700/0600).
@Injectable()
export class AttachmentStorage {
  private readonly logger = new Logger(AttachmentStorage.name);
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = path.resolve(
      config.get<string>('ATTACHMENTS_DIR', './storage/attachments'),
    );
  }

  // Cualquier clave que, resuelta, salga de la carpeta raíz (../, rutas
  // absolutas...) se rechaza: la clave sale de la BD, pero un dato manipulado
  // no debe poder leer ni borrar ficheros ajenos.
  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) {
      throw new Error('Ruta de adjunto no válida');
    }
    return full;
  }

  async save(
    tenantId: string,
    entryId: string,
    extension: string,
    data: Buffer,
  ): Promise<string> {
    const key = `${tenantId}/${entryId}/${randomUUID()}.${extension}`;
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    await writeFile(full, data, { mode: 0o600, flag: 'wx' });
    return key;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  createReadStream(key: string): ReadStream {
    return createReadStream(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  // Borrado de archivos tras borrar sus filas (descartar o caducar un borrador,
  // eliminar un usuario): nunca debe tumbar la operación principal. Un fallo
  // deja un archivo huérfano en disco, que se registra para poder limpiarlo.
  async deleteMany(keys: string[]): Promise<void> {
    const results = await Promise.allSettled(
      keys.map((key) => this.delete(key)),
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        this.logger.warn(
          `No se pudo borrar el adjunto ${keys[i]}: ${String(r.reason)}`,
        );
      }
    });
  }
}
