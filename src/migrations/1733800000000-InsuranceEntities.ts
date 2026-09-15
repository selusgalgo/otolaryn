import { MigrationInterface, QueryRunner } from 'typeorm';

// Tenant-scoped catalog of insurance/aseguradora names — see
// arquitectura_otolaryn_saas.md section 3: treated as a reference/cache
// table for now (populated manually or via the legacy data migration), not
// synced from an external source of truth yet. Same RLS shape as every
// other tenant-owned table (patients, appointments, clinical_entries).
export class InsuranceEntities1733800000000 implements MigrationInterface {
  name = 'InsuranceEntities1733800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE public.insurance_entities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Case-insensitive: the legacy import normalizes (TRIM + uppercase)
    // before inserting, but this stops a future duplicate regardless of
    // where the insert comes from.
    await queryRunner.query(`
      CREATE UNIQUE INDEX insurance_entities_tenant_name_idx
        ON public.insurance_entities (tenant_id, lower(name))
    `);
    await queryRunner.query(
      `ALTER TABLE public.insurance_entities ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE public.insurance_entities FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON public.insurance_entities
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    `);

    // Both a patient's own insurer and a given consulta's insurer can
    // differ (a patient can switch insurer between visits) — the legacy
    // data has an ENTIDAD column on both pacientes.xls and consultas.xls,
    // so both tables get their own nullable reference.
    await queryRunner.query(`
      ALTER TABLE public.patients
        ADD COLUMN insurance_entity_id uuid REFERENCES public.insurance_entities(id)
    `);
    await queryRunner.query(`
      ALTER TABLE public.clinical_entries
        ADD COLUMN insurance_entity_id uuid REFERENCES public.insurance_entities(id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.clinical_entries DROP COLUMN insurance_entity_id
    `);
    await queryRunner.query(`
      ALTER TABLE public.patients DROP COLUMN insurance_entity_id
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS public.insurance_entities`);
  }
}
