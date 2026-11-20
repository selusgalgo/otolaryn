import { MigrationInterface, QueryRunner } from 'typeorm';

export class WhatsappClinicSettings1737200000000 implements MigrationInterface {
  name = 'WhatsappClinicSettings1737200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE iam.whatsapp_booking_settings (
      tenant_id uuid PRIMARY KEY REFERENCES iam.tenants(id) ON DELETE CASCADE,
      platform_enabled boolean NOT NULL DEFAULT false,
      clinic_enabled boolean NOT NULL DEFAULT false,
      ask_reason boolean NOT NULL DEFAULT true,
      horizon_days integer NOT NULL DEFAULT 30 CHECK (horizon_days BETWEEN 1 AND 90),
      lead_minutes integer NOT NULL DEFAULT 0 CHECK (lead_minutes BETWEEN 0 AND 10080),
      practitioner_ids uuid[] NOT NULL DEFAULT '{}'
    )`);
    await queryRunner.query(
      'GRANT SELECT, INSERT, UPDATE ON iam.whatsapp_booking_settings TO otolaryn_app',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE iam.whatsapp_booking_settings');
  }
}
