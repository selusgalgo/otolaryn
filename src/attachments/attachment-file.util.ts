// Archivos adjuntos a una consulta: qué se admite y cómo se valida. Son datos de
// salud que llegan de fuera, así que el tipo se decide por el CONTENIDO real del
// archivo (sus primeros bytes), nunca por la extensión ni por el Content-Type que
// diga el cliente.
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_ENTRY = 10;

export type AttachmentMime =
  'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';

const EXTENSIONS: Record<AttachmentMime, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function extensionFor(mime: AttachmentMime): string {
  return EXTENSIONS[mime];
}

// null = no es ninguno de los tipos admitidos (SVG, HTML, ejecutables, texto...).
export function sniffMime(data: Buffer): AttachmentMime | null {
  if (data.length >= 5 && data.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'application/pdf';
  }
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    data.length >= 8 &&
    data
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('latin1') === 'RIFF' &&
    data.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

// multer entrega el nombre original leído como latin1: un "Radiografía.pdf"
// subido en UTF-8 llega como "RadiografÃ­a.pdf". Se deshace esa lectura.
export function decodeUploadName(raw: string): string {
  const decoded = Buffer.from(raw, 'latin1').toString('utf8');
  return decoded.includes('�') ? raw : decoded;
}

// Nombre para mostrar y para la cabecera de descarga: sin rutas, sin caracteres
// de control ni los que rompen cabeceras o sistemas de ficheros, y acotado. El
// archivo en disco NO usa este nombre (usa un UUID), así que esto es solo
// presentación.
export function safeDisplayName(raw: string, fallback = 'archivo'): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F"<>:*?|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const trimmed = cleaned.length > 120 ? cleaned.slice(-120) : cleaned;
  return trimmed && trimmed !== '.' && trimmed !== '..' ? trimmed : fallback;
}
