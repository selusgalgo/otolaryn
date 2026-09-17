import { MigrationInterface, QueryRunner } from 'typeorm';

// Documento (DNI/NIE/pasaporte) stops being mandatory — plenty of real
// patients (the legacy migration's own pacientes.xls included, ~80% of its
// rows) simply don't have one on file. The existing unique index
// (patients_tenant_document_id_idx, tenant_id + document_id WHERE
// deleted_at IS NULL) needs no change at all: Postgres already treats every
// NULL in a unique index as distinct from every other NULL, so any number
// of documentId-less patients can coexist per tenant without touching that
// constraint.
export class PatientDocumentIdOptional1734200000000 implements MigrationInterface {
  name = 'PatientDocumentIdOptional1734200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients ALTER COLUMN document_id DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Not safely reversible if any row is already NULL — same stance as
    // every other legacy-adjacent migration on this branch (aditive-only,
    // no backfill invented here). A real rollback would need a caller-
    // supplied backfill value first.
    await queryRunner.query(`
      ALTER TABLE public.patients ALTER COLUMN document_id SET NOT NULL
    `);
  }
}
