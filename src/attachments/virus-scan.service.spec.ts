import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VirusScanService } from './virus-scan.service';

// Un clamd de mentira: habla el protocolo INSTREAM (comando, trozos con su
// longitud en 4 bytes y un trozo de longitud 0 al final) y contesta según el
// contenido que reciba.
function fakeClamd(
  socketPath: string,
  verdict: (file: Buffer) => string,
): net.Server {
  const server = net.createServer((socket) => {
    let buf = Buffer.alloc(0);
    socket.on('data', (c) => {
      buf = Buffer.concat([buf, c]);
      let offset = 'zINSTREAM\0'.length;
      if (buf.length < offset) return;
      const parts: Buffer[] = [];
      for (;;) {
        if (buf.length < offset + 4) return;
        const len = buf.readUInt32BE(offset);
        offset += 4;
        if (len === 0) break;
        if (buf.length < offset + len) return;
        parts.push(buf.subarray(offset, offset + len));
        offset += len;
      }
      socket.end(`${verdict(Buffer.concat(parts))}\0`);
    });
  });
  server.listen(socketPath);
  return server;
}

describe('VirusScanService', () => {
  let dir: string;
  let socketPath: string;
  let server: net.Server | undefined;

  const service = (socket?: string) =>
    new VirusScanService(
      new ConfigService(socket ? { ATTACHMENTS_CLAMAV_SOCKET: socket } : {}),
    );

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clamd-'));
    socketPath = path.join(dir, 'clamd.sock');
  });
  afterEach(async () => {
    await new Promise<void>((resolve) =>
      server ? server.close(() => resolve()) : resolve(),
    );
    server = undefined;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('sin socket configurado no analiza (desarrollo y tests)', async () => {
    const s = service();
    expect(s.enabled).toBe(false);
    await expect(
      s.assertClean(Buffer.from('lo que sea')),
    ).resolves.toBeUndefined();
  });

  it('deja pasar un archivo limpio, también de varios trozos', async () => {
    server = fakeClamd(socketPath, () => 'stream: OK');
    await new Promise((r) => server!.once('listening', r));
    const big = Buffer.alloc(200_000, 7); // más de un trozo de 64 KB
    await expect(service(socketPath).assertClean(big)).resolves.toBeUndefined();
  });

  it('el demonio recibe el archivo íntegro', async () => {
    let received: Buffer = Buffer.alloc(0);
    server = fakeClamd(socketPath, (file) => {
      received = file;
      return 'stream: OK';
    });
    await new Promise((r) => server!.once('listening', r));
    const data = Buffer.from(
      Array.from({ length: 150_000 }, (_, i) => i % 251),
    );
    await service(socketPath).assertClean(data);
    expect(received.equals(data)).toBe(true);
  });

  it('rechaza un archivo infectado', async () => {
    server = fakeClamd(socketPath, () => 'stream: Eicar-Signature FOUND');
    await new Promise((r) => server!.once('listening', r));
    await expect(
      service(socketPath).assertClean(Buffer.from('x')),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('si el antivirus está activado y no responde, rechaza en vez de guardar sin analizar', async () => {
    await expect(
      service(path.join(dir, 'no-existe.sock')).assertClean(Buffer.from('x')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('una respuesta que no es ni OK ni FOUND también se rechaza', async () => {
    server = fakeClamd(
      socketPath,
      () => 'stream: INSTREAM size limit exceeded. ERROR',
    );
    await new Promise((r) => server!.once('listening', r));
    await expect(
      service(socketPath).assertClean(Buffer.from('x')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
