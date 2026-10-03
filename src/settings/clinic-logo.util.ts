import { BadRequestException } from '@nestjs/common';

// Keeps iam.tenants.logo small — these are letterhead logos embedded
// straight into a generated PDF (see PdfService's comment on why: no local
// path/URL loading is allowed there), not photos. 1 MB comfortably fits any
// reasonable logo while keeping the data: URI this turns into well clear of
// Postgres/TypeORM's practical limits for a single text column value.
const MAX_LOGO_BYTES = 1_000_000;

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

// Turns an uploaded logo file into the data: URI stored on Tenant.logo, or
// throws a validation error the controller doesn't need to spell out itself
// — shared by SettingsController (own clinic) and PlatformController
// (superadmin, any clinic), which both accept the same multipart shape.
export function logoFileToDataUri(file: Express.Multer.File): string {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new BadRequestException(
      'El logo debe ser una imagen PNG, JPEG o WebP',
    );
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new BadRequestException('El logo no puede superar 1 MB');
  }
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}
