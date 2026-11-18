import { MigrationInterface, QueryRunner } from 'typeorm';

export class WhatsappClinicFeatures1737400000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.whatsapp_booking_settings
        ADD COLUMN features jsonb NOT NULL DEFAULT '{}';
      CREATE TABLE public.whatsapp_booking_activity (
        tenant_id uuid NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        appointment_id uuid NOT NULL,
        kind text NOT NULL CHECK (kind IN ('booked', 'cancelled', 'rescheduled')),
        notify_reception boolean NOT NULL DEFAULT false,
        acknowledged_at timestamptz,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, id)
      );
      CREATE INDEX whatsapp_booking_activity_recent
        ON public.whatsapp_booking_activity(tenant_id, occurred_at DESC);
      CREATE UNIQUE INDEX whatsapp_booking_activity_booked
        ON public.whatsapp_booking_activity(tenant_id, appointment_id) WHERE kind = 'booked';
      ALTER TABLE public.whatsapp_booking_activity ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.whatsapp_booking_activity FORCE ROW LEVEL SECURITY;
      CREATE POLICY whatsapp_activity_tenant ON public.whatsapp_booking_activity
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
      GRANT SELECT, INSERT, UPDATE ON public.whatsapp_booking_activity TO otolaryn_app;
      ALTER TABLE public.appointments
        ADD COLUMN whatsapp_visit_type text,
        ADD COLUMN whatsapp_reminder_phone text;
      CREATE TABLE public.whatsapp_booking_reminders (
        tenant_id uuid NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
        appointment_id uuid NOT NULL,
        scheduled_at timestamptz NOT NULL,
        attempted_at timestamptz NOT NULL DEFAULT now(),
        status text NOT NULL CHECK (status IN ('sending', 'accepted', 'failed', 'uncertain')),
        PRIMARY KEY (tenant_id, appointment_id, scheduled_at)
      );
      ALTER TABLE public.whatsapp_booking_reminders ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.whatsapp_booking_reminders FORCE ROW LEVEL SECURITY;
      CREATE POLICY whatsapp_reminders_tenant ON public.whatsapp_booking_reminders
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
      GRANT SELECT, INSERT, UPDATE ON public.whatsapp_booking_reminders TO otolaryn_app;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE public.whatsapp_booking_reminders;
      ALTER TABLE public.appointments DROP COLUMN whatsapp_visit_type, DROP COLUMN whatsapp_reminder_phone;
      DROP TABLE public.whatsapp_booking_activity;
      ALTER TABLE iam.whatsapp_booking_settings DROP COLUMN features;
    `);
  }
}
