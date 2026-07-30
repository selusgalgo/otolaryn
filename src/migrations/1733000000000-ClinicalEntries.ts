import { MigrationInterface, QueryRunner } from 'typeorm';

// clinical_entries is intentionally append-only: no deleted_at, and the
// application layer never exposes an UPDATE or DELETE for it (see
// ClinicalEntriesService/Controller — create and read only). Corrections
// are made by adding a new entry, not editing history.
export class ClinicalEntries1733000000000 implements MigrationInterface {
  name = 'ClinicalEntries1733000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE public.clinical_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
        patient_id uuid NOT NULL,
        author_user_id uuid NOT NULL REFERENCES iam.users(id),
        visit_date timestamptz NOT NULL DEFAULT now(),
        chief_complaint text NOT NULL,
        examination_findings text,
        diagnosis text,
        treatment text,
        follow_up_notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT clinical_entries_patient_tenant_fk
          FOREIGN KEY (patient_id, tenant_id)
          REFERENCES public.patients (id, tenant_id)
      )
    `);

    await queryRunner.query(
      `ALTER TABLE public.clinical_entries ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE public.clinical_entries FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON public.clinical_entries
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.clinical_entries`);
  }
}
