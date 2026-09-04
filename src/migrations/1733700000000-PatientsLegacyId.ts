import { MigrationInterface, QueryRunner } from 'typeorm';

// Preserves NUMHISTORIA from the legacy OTOLARYN desktop app as a plain
// indexed column — never the primary key (that stays UUID) — so the
// historical data migration is traceable back to its source row and
// because clinic staff still refer to patients by this number from memory.
// Nullable: only patients created via that migration ever get one; patients
// created directly in the app never will.
export class PatientsLegacyId1733700000000 implements MigrationInterface {
  name = 'PatientsLegacyId1733700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.patients ADD COLUMN legacy_id text`,
    );
    // Partial + scoped by tenant: two different clinics' legacy systems
    // could both have had a "NUMHISTORIA 145", and a patient created
    // directly in the app has no legacy_id at all (NULL, excluded here).
    await queryRunner.query(`
      CREATE UNIQUE INDEX patients_tenant_legacy_id_idx
        ON public.patients (tenant_id, legacy_id)
        WHERE legacy_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS patients_tenant_legacy_id_idx`,
    );
    await queryRunner.query(
      `ALTER TABLE public.patients DROP COLUMN legacy_id`,
    );
  }
}
