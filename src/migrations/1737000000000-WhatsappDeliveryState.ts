import { MigrationInterface, QueryRunner } from 'typeorm';

export class WhatsappDeliveryState1737000000000 implements MigrationInterface {
  name = 'WhatsappDeliveryState1737000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.whatsapp_booking_receipts
      ADD COLUMN delivery_status text NOT NULL DEFAULT 'pending'
        CHECK (delivery_status IN ('pending', 'claimed', 'sent', 'uncertain')),
      ADD COLUMN delivery_attempt uuid,
      ADD COLUMN delivery_claimed_at timestamptz`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.whatsapp_booking_receipts
      DROP COLUMN delivery_claimed_at,
      DROP COLUMN delivery_attempt,
      DROP COLUMN delivery_status`);
  }
}
