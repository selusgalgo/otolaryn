import { MigrationInterface, QueryRunner } from 'typeorm';

export class WhatsappBookingConversation1736900000000 implements MigrationInterface {
  name = 'WhatsappBookingConversation1736900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE public.whatsapp_booking_sessions (
      tenant_id uuid NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
      phone_hash text NOT NULL,
      state jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id, phone_hash)
    )`);
    await queryRunner.query(`CREATE TABLE public.whatsapp_booking_receipts (
      tenant_id uuid NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
      message_hash text NOT NULL,
      phone_hash text NOT NULL,
      content_hash text NOT NULL,
      reply text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id, message_hash)
    )`);
    for (const table of [
      'whatsapp_booking_sessions',
      'whatsapp_booking_receipts',
    ]) {
      await queryRunner.query(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(`CREATE POLICY tenant_isolation ON public.${table}
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`);
      await queryRunner.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON public.${table} TO otolaryn_app`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE public.whatsapp_booking_receipts');
    await queryRunner.query('DROP TABLE public.whatsapp_booking_sessions');
  }
}
