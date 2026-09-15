import { MigrationInterface, QueryRunner } from 'typeorm';

// Makes the historical data migration's Paso 3 (consultas → clinical
// entries) safely re-runnable: unlike patients (legacy_id = NUMHISTORIA,
// already unique per patient), a single NUMHISTORIA has many consultas, so
// there's no natural key to check "was this row already imported" against.
// legacy_id here is the 1-based row index within consultas.xls, not
// NUMHISTORIA — deterministic across re-runs of the same, unchanging source
// export, and scoped per tenant like every other legacy_id in this schema.
export class ClinicalEntriesLegacyId1733950000000 implements MigrationInterface {
  name = 'ClinicalEntriesLegacyId1733950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.clinical_entries ADD COLUMN legacy_id text`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX clinical_entries_tenant_legacy_id_idx
        ON public.clinical_entries (tenant_id, legacy_id)
        WHERE legacy_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS clinical_entries_tenant_legacy_id_idx`,
    );
    await queryRunner.query(
      `ALTER TABLE public.clinical_entries DROP COLUMN legacy_id`,
    );
  }
}
