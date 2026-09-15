import { MigrationInterface, QueryRunner } from 'typeorm';

// PROFESION on the legacy pacientes.xls (occupation, e.g. "POLICIA LOCAL",
// "PENSIONISTA") — present on 43% of rows, with nowhere to persist it until
// now. Additive, nullable, no backfill — same shape as every other
// legacy-adjacent column added on this branch.
export class PatientProfession1734100000000 implements MigrationInterface {
  name = 'PatientProfession1734100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients
        ADD COLUMN profession text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients
        DROP COLUMN profession
    `);
  }
}
