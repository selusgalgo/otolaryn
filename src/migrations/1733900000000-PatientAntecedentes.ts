import { MigrationInterface, QueryRunner } from 'typeorm';

// Configurable per-tenant catalog of antecedentes personales — see
// arquitectura_otolaryn_saas.md section 11. Deliberately NOT the EAV
// pattern rejected for audiometry (section 3, frequency_values aside):
// antecedentes are a small, tenant-editable list of categories with a
// single optional free-text nuance field (e.g. "4-5" cigarettes/day),
// which a catalog + join-row relation fits cleanly without sacrificing
// referential integrity the way a generic EAV table would.
export class PatientAntecedentes1733900000000 implements MigrationInterface {
  name = 'PatientAntecedentes1733900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE public.antecedente_types (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
        name text NOT NULL,
        active boolean NOT NULL DEFAULT true,
        display_order integer NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX antecedente_types_tenant_name_idx
        ON public.antecedente_types (tenant_id, lower(name))
    `);
    await queryRunner.query(
      `ALTER TABLE public.antecedente_types ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE public.antecedente_types FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON public.antecedente_types
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    `);

    await queryRunner.query(`
      CREATE TABLE public.patient_antecedentes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
        patient_id uuid NOT NULL,
        antecedente_type_id uuid NOT NULL REFERENCES public.antecedente_types(id),
        detalle text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT patient_antecedentes_patient_tenant_fk
          FOREIGN KEY (patient_id, tenant_id)
          REFERENCES public.patients (id, tenant_id),
        -- The row's mere existence means "marcado" (see architecture doc) —
        -- a patient can't have the same antecedente twice.
        CONSTRAINT patient_antecedentes_unique UNIQUE (patient_id, antecedente_type_id)
      )
    `);
    await queryRunner.query(
      `ALTER TABLE public.patient_antecedentes ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE public.patient_antecedentes FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON public.patient_antecedentes
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    `);

    // Backfill: every existing tenant gets the 13 antecedentes already
    // present in the legacy system (same fixed columns TABACO, ALCOHOL...),
    // in their original order — same "seed every tenant" intent as
    // ClinicHoursSlots1733600000000, but antecedente_types (unlike
    // iam.clinic_hours) is RLS-protected with FORCE ROW LEVEL SECURITY, so
    // a single cross-tenant INSERT...SELECT can't satisfy the per-row
    // policy — even the owner is subject to it once FORCE is set. Looping
    // per tenant with set_config first is the same dance seed.ts already
    // uses for RLS-protected inserts.
    const tenants = (await queryRunner.query(`SELECT id FROM iam.tenants`)) as {
      id: string;
    }[];
    for (const tenant of tenants) {
      await queryRunner.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        tenant.id,
      ]);
      await queryRunner.query(
        `
        INSERT INTO public.antecedente_types (tenant_id, name, display_order)
        VALUES
          ($1, 'Tabaco', 0),
          ($1, 'Alcohol', 1),
          ($1, 'Diabetes', 2),
          ($1, 'HTA', 3),
          ($1, 'EPOC', 4),
          ($1, 'Glaucoma', 5),
          ($1, 'Gastralgias', 6),
          ($1, 'Alergias ambientales', 7),
          ($1, 'Alergias medicamentosas', 8),
          ($1, 'Cirugías', 9),
          ($1, 'Tumores', 10),
          ($1, 'Sordera', 11),
          ($1, 'Otras', 12)
      `,
        [tenant.id],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.patient_antecedentes`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.antecedente_types`);
  }
}
