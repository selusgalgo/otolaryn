import { MigrationInterface, QueryRunner } from 'typeorm';

/** Stores connection metadata per clinic. No integration is activated by this migration. */
export class WhatsappTenantConnection1737500000000 implements MigrationInterface {
  name = 'WhatsappTenantConnection1737500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE public.whatsapp_tenant_connections (
      tenant_id uuid PRIMARY KEY REFERENCES iam.tenants(id) ON DELETE CASCADE,
      waba_id text NOT NULL CHECK (waba_id ~ '^[0-9]{1,30}$'),
      phone_number_id text NOT NULL UNIQUE CHECK (phone_number_id ~ '^[0-9]{1,30}$'),
      encrypted_access_token text NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'disconnected', 'error')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(
      'ALTER TABLE public.whatsapp_tenant_connections ENABLE ROW LEVEL SECURITY',
    );
    await queryRunner.query(
      'ALTER TABLE public.whatsapp_tenant_connections FORCE ROW LEVEL SECURITY',
    );
    await queryRunner.query(`CREATE POLICY tenant_isolation ON public.whatsapp_tenant_connections
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`);
    await queryRunner.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_tenant_connections TO otolaryn_app',
    );
    // Routing needs to resolve a Meta phone id before a tenant transaction
    // exists. Keep only the routing key in a private table and expose a
    // lookup function, not cross-tenant access to connection credentials.
    await queryRunner.query(`CREATE TABLE iam.whatsapp_connection_routes (
      phone_number_id text PRIMARY KEY,
      tenant_id uuid NOT NULL UNIQUE REFERENCES iam.tenants(id) ON DELETE CASCADE
    )`);
    await queryRunner.query(
      'REVOKE ALL ON iam.whatsapp_connection_routes FROM PUBLIC, otolaryn_app',
    );
    await queryRunner.query(`CREATE FUNCTION iam.sync_whatsapp_connection_route() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
      BEGIN
        IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
          DELETE FROM iam.whatsapp_connection_routes WHERE tenant_id = OLD.tenant_id;
        END IF;
        IF TG_OP <> 'DELETE' AND NEW.status = 'ready' THEN
          INSERT INTO iam.whatsapp_connection_routes (phone_number_id, tenant_id) VALUES (NEW.phone_number_id, NEW.tenant_id);
        END IF;
        RETURN NULL;
      END $$`);
    await queryRunner.query(
      'REVOKE ALL ON FUNCTION iam.sync_whatsapp_connection_route() FROM PUBLIC',
    );
    await queryRunner.query(`CREATE TRIGGER whatsapp_connection_route_sync
      AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_tenant_connections
      FOR EACH ROW EXECUTE FUNCTION iam.sync_whatsapp_connection_route()`);
    await queryRunner.query(`CREATE FUNCTION iam.whatsapp_connection_tenant(p_phone_number_id text) RETURNS uuid
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
      SELECT tenant_id FROM iam.whatsapp_connection_routes WHERE phone_number_id = p_phone_number_id
      $$`);
    await queryRunner.query(
      'REVOKE ALL ON FUNCTION iam.whatsapp_connection_tenant(text) FROM PUBLIC',
    );
    await queryRunner.query(
      'GRANT EXECUTE ON FUNCTION iam.whatsapp_connection_tenant(text) TO otolaryn_app',
    );
    await queryRunner.query(`CREATE TABLE public.whatsapp_onboarding_attempts (
      tenant_id uuid NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
      state_hash text NOT NULL CHECK (state_hash ~ '^[0-9a-f]{64}$'),
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      PRIMARY KEY (tenant_id, state_hash)
    )`);
    await queryRunner.query(
      'ALTER TABLE public.whatsapp_onboarding_attempts ENABLE ROW LEVEL SECURITY',
    );
    await queryRunner.query(
      'ALTER TABLE public.whatsapp_onboarding_attempts FORCE ROW LEVEL SECURITY',
    );
    await queryRunner.query(`CREATE POLICY tenant_isolation ON public.whatsapp_onboarding_attempts
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`);
    await queryRunner.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_onboarding_attempts TO otolaryn_app',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE public.whatsapp_onboarding_attempts');
    await queryRunner.query(
      'DROP TRIGGER whatsapp_connection_route_sync ON public.whatsapp_tenant_connections',
    );
    await queryRunner.query(
      'DROP FUNCTION iam.sync_whatsapp_connection_route()',
    );
    await queryRunner.query(
      'DROP FUNCTION iam.whatsapp_connection_tenant(text)',
    );
    await queryRunner.query('DROP TABLE iam.whatsapp_connection_routes');
    await queryRunner.query('DROP TABLE public.whatsapp_tenant_connections');
  }
}
