import { MigrationInterface, QueryRunner } from 'typeorm';

// Lets each clinic configure the identity shown on its exported PDFs
// (ficha de paciente, tratamiento) — name already existed (set once at
// creation by superadmin), address/phone/logo are new. logo is stored as a
// data: URI (base64), not a file path/URL: PdfService's pdfMake instance
// deliberately denies loading images by local path or URL (see its
// setLocalAccessPolicy/setUrlAccessPolicy), so embedding the bytes directly
// in the docDefinition is the only way a logo reaches a generated PDF
// without weakening that hardening. All nullable, no backfill — same
// forward-only pattern as every other per-clinic setting added so far.
export class TenantClinicProfile1735300000000 implements MigrationInterface {
  name = 'TenantClinicProfile1735300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.tenants
        ADD COLUMN address text,
        ADD COLUMN phone text,
        ADD COLUMN logo text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.tenants
        DROP COLUMN address,
        DROP COLUMN phone,
        DROP COLUMN logo
    `);
  }
}
