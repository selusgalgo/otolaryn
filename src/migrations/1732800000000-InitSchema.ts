import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1732800000000 implements MigrationInterface {
  name = 'InitSchema1732800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE SCHEMA IF NOT EXISTS iam AUTHORIZATION otolaryn_owner`,
    );

    await queryRunner.query(`
      CREATE TABLE iam.tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE iam.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
        email text NOT NULL,
        password_hash text NOT NULL,
        role text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX users_email_lower_idx ON iam.users (lower(email))`,
    );

    // iam.* is intentionally not RLS-protected (see User entity comment) —
    // grant plain SELECT so the login flow can look up a user with no
    // tenant context set yet.
    await queryRunner.query(`GRANT USAGE ON SCHEMA iam TO otolaryn_app`);
    await queryRunner.query(
      `GRANT SELECT ON iam.tenants, iam.users TO otolaryn_app`,
    );

    await queryRunner.query(`
      CREATE TABLE public.patients (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE public.patients FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON public.patients
        -- NULLIF(..., '') matters: on a pooled connection that has
        -- previously run SET LOCAL/set_config for this GUC and then
        -- committed, current_setting(..., true) resets to '' rather than
        -- NULL for the rest of the session. Without the NULLIF, ''::uuid
        -- throws instead of the policy simply denying every row.
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    `);

    await queryRunner.query(`
      CREATE TABLE public.appointments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
        patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
        notes text,
        scheduled_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE public.appointments FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON public.appointments
        -- NULLIF(..., '') matters: on a pooled connection that has
        -- previously run SET LOCAL/set_config for this GUC and then
        -- committed, current_setting(..., true) resets to '' rather than
        -- NULL for the rest of the session. Without the NULLIF, ''::uuid
        -- throws instead of the policy simply denying every row.
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.appointments`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.patients`);
    await queryRunner.query(`DROP TABLE IF EXISTS iam.users`);
    await queryRunner.query(`DROP TABLE IF EXISTS iam.tenants`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS iam`);
  }
}
