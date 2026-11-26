import { MigrationInterface, QueryRunner } from 'typeorm';

/** Exposes only tenants eligible for reminder processing to the app worker. */
export class WhatsappReminderTenantConfig1738400000000 implements MigrationInterface {
  name = 'WhatsappReminderTenantConfig1738400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE FUNCTION iam.whatsapp_reminder_tenants() RETURNS TABLE(tenant_id uuid)
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
        SELECT routes.tenant_id
        FROM iam.whatsapp_connection_routes routes
        JOIN iam.whatsapp_booking_settings settings ON settings.tenant_id = routes.tenant_id
        WHERE settings.platform_enabled = true
          AND settings.clinic_enabled = true
          AND CASE
            WHEN settings.features->>'reminderHours' ~ '^[0-9]{1,3}$'
            THEN (settings.features->>'reminderHours')::integer > 0
            ELSE false
          END
          AND COALESCE(settings.features->>'reminderTemplateName', '') ~ '^[a-z][a-z0-9_]{0,127}$'
          AND COALESCE(settings.features->>'reminderTemplateLanguage', '') ~ '^[a-z]{2,3}(_[A-Z]{2})?$'
      $$`);
    await queryRunner.query(
      'REVOKE ALL ON FUNCTION iam.whatsapp_reminder_tenants() FROM PUBLIC',
    );
    await queryRunner.query(
      'GRANT EXECUTE ON FUNCTION iam.whatsapp_reminder_tenants() TO otolaryn_app',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP FUNCTION iam.whatsapp_reminder_tenants()');
  }
}
