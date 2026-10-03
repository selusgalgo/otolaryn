import { BadRequestException } from '@nestjs/common';
import { Jimp } from 'jimp';

// Keeps iam.tenants.logo small — these are letterhead logos embedded
// straight into a generated PDF (see PdfService's comment on why: no local
// path/URL loading is allowed there), not photos. 1 MB comfortably fits any
// reasonable logo while keeping the data: URI this turns into well clear of
// Postgres/TypeORM's practical limits for a single text column value. The
// circular crop below inflates the original a little (PNG, transparent
// corners) — checked against the uploaded file, not the processed output,
// since that's the size an admin actually picked.
const MAX_LOGO_BYTES = 1_000_000;

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

// Turns an uploaded logo file into the data: URI stored on Tenant.logo —
// cropped to a centered square and masked into a circle first, so every
// consumer (the Configuración preview, the PDF letterhead in
// clinic-header.util.ts) already gets the shape the letterhead wants
// without re-deriving it on every PDF export. Jimp is pure JS (no native
// bindings, unlike sharp) — deliberately picked after the htmlparser2
// incident (see commit history) made native/ESM-only dependency risk in
// this Vercel serverless backend very concrete. Throws a validation error
// the controller doesn't need to spell out itself — shared by
// SettingsController (own clinic) and PlatformController (superadmin, any
// clinic), which both accept the same multipart shape.
export async function logoFileToDataUri(
  file: Express.Multer.File,
): Promise<string> {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new BadRequestException(
      'El logo debe ser una imagen PNG, JPEG o WebP',
    );
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new BadRequestException('El logo no puede superar 1 MB');
  }

  const image = await Jimp.read(file.buffer);
  const size = Math.min(image.bitmap.width, image.bitmap.height);
  image.cover({ w: size, h: size });
  image.circle();
  const buffer = await image.getBuffer('image/png');
  return `data:image/png;base64,${buffer.toString('base64')}`;
}
