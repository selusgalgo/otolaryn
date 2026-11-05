// Mismos límites que la API (ver attachment-file.util.ts del backend): ahí se
// hacen cumplir de verdad; aquí solo sirven para avisar antes de subir.
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_ENTRY = 10;

export const ACCEPTED_ATTACHMENT_TYPES = "application/pdf,image/jpeg,image/png,image/webp";

// Como WhatsApp: una foto de móvil (12 MP o más) pesa varios MB y no hace falta
// tanto para verla en pantalla. Se reduce el lado largo y se recomprime.
export const IMAGE_MAX_SIDE = 1920;
export const IMAGE_JPEG_QUALITY = 0.82;

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

// Tamaño al que reducir una imagen: nunca se amplía, y se conservan las
// proporciones con el lado largo como máximo `maxSide`.
export function targetImageSize(width: number, height: number, maxSide = IMAGE_MAX_SIDE) {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Reduce una foto antes de subirla. Los PDF y las imágenes que no se pueden
// mejorar (ya pequeñas, formato que el navegador no sabe recomprimir, error al
// decodificar) se suben tal cual. Los PNG y WebP se pasan a JPEG, que es lo que
// hace que pesen mucho menos; si el resultado no pesa menos que el original, se
// queda el original.
export async function prepareAttachment(file: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = targetImageSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // Los PNG con transparencia saldrían con fondo negro en JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", IMAGE_JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}
