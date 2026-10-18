import { MigrationInterface, QueryRunner } from 'typeorm';

// Backs the batched import flow (Pacientes/Consultas) — a bulk import used
// to run start-to-finish inside one HTTP request, which a large legacy
// file (thousands of rows, each needing its own sequential DB round trips)
// blows straight through Vercel's 300s function timeout. A job row holds
// the already-parsed rows and a cursor; each `.../import/:id/continue`
// call processes one bounded batch and commits before returning, so the
// client can poll for real progress and the whole import survives being
// spread across as many short requests as it takes.
export class ImportJobs1735600000000 implements MigrationInterface {
  name = 'ImportJobs1735600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE public.import_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
        type text NOT NULL,
        status text NOT NULL DEFAULT 'running',
        rows jsonb NOT NULL,
        extra jsonb,
        total_rows integer NOT NULL,
        cursor integer NOT NULL DEFAULT 0,
        created_count integer NOT NULL DEFAULT 0,
        skipped jsonb NOT NULL DEFAULT '[]',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE public.import_jobs FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON public.import_jobs
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    `);
    // See GrantMissingPublicTablePrivileges1735000000000 — production has
    // no ALTER DEFAULT PRIVILEGES rule, so every new public table needs
    // this spelled out explicitly or otolaryn_app gets "permission denied"
    // the first time this table is touched.
    await queryRunner.query(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_jobs TO otolaryn_app
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.import_jobs`);
  }
}
