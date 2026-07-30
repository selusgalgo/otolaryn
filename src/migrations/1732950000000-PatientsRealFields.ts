import { MigrationInterface, QueryRunner } from 'typeorm';

// Replaces the spike's placeholder `patients.name` with the real fields the
// Pacientes module needs, and adds soft-delete support. Assumes a fresh/dev
// database with no production data to preserve (there isn't any yet) — the
// NOT NULL columns added here will fail on a table with existing rows, so
// local/CI databases need to be reset before running this.
export class PatientsRealFields1732950000000 implements MigrationInterface {
  name = 'PatientsRealFields1732950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients
        DROP COLUMN name,
        ADD COLUMN first_name text NOT NULL,
        ADD COLUMN last_name text NOT NULL,
        ADD COLUMN document_id text NOT NULL,
        ADD COLUMN date_of_birth date NOT NULL,
        ADD COLUMN phone text NOT NULL,
        ADD COLUMN email text,
        ADD COLUMN address text,
        ADD COLUMN notes text,
        ADD COLUMN deleted_at timestamptz
    `);

    // Partial index: excludes soft-deleted rows so a document_id can be
    // reused after the original patient record was deleted.
    await queryRunner.query(`
      CREATE UNIQUE INDEX patients_tenant_document_id_idx
        ON public.patients (tenant_id, document_id)
        WHERE deleted_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS patients_tenant_document_id_idx`,
    );
    await queryRunner.query(`
      ALTER TABLE public.patients
        DROP COLUMN first_name,
        DROP COLUMN last_name,
        DROP COLUMN document_id,
        DROP COLUMN date_of_birth,
        DROP COLUMN phone,
        DROP COLUMN email,
        DROP COLUMN address,
        DROP COLUMN notes,
        DROP COLUMN deleted_at,
        ADD COLUMN name text NOT NULL DEFAULT ''
    `);
  }
}
