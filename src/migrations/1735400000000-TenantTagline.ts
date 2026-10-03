import { MigrationInterface, QueryRunner } from 'typeorm';

// A short subtitle shown under the clinic name in the PDF letterhead (e.g.
// "Otorrinolaringología — Cirugía de cara y cuello"), alongside the
// address/phone added in TenantClinicProfile1735300000000. Optional, no
// backfill — same forward-only pattern as the rest of the clinic profile.
export class TenantTagline1735400000000 implements MigrationInterface {
  name = 'TenantTagline1735400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.tenants
        ADD COLUMN tagline text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.tenants
        DROP COLUMN tagline
    `);
  }
}
