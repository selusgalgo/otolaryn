import { MigrationInterface, QueryRunner } from 'typeorm';

// Splits the address out from the single free-text "Dirección" field:
// city, province and postal code as their own columns. Additive, nullable,
// no backfill — same shape as every other legacy-adjacent column added on
// this branch.
export class PatientAddressFields1734300000000 implements MigrationInterface {
  name = 'PatientAddressFields1734300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients
        ADD COLUMN city text,
        ADD COLUMN province text,
        ADD COLUMN postal_code text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients
        DROP COLUMN city,
        DROP COLUMN province,
        DROP COLUMN postal_code
    `);
  }
}
