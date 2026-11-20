import { MigrationInterface, QueryRunner } from 'typeorm';

export class WhatsappCancellationSettings1737300000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.whatsapp_booking_settings
        ADD COLUMN cancellation_enabled boolean NOT NULL DEFAULT true,
        ADD COLUMN cancellation_notice_hours integer NOT NULL DEFAULT 0
          CHECK (cancellation_notice_hours BETWEEN 0 AND 168)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.whatsapp_booking_settings
        DROP COLUMN cancellation_enabled,
        DROP COLUMN cancellation_notice_hours
    `);
  }
}
