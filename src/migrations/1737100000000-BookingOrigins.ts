import { MigrationInterface, QueryRunner } from 'typeorm';

export class BookingOrigins1737100000000 implements MigrationInterface {
  name = 'BookingOrigins1737100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.patients ADD COLUMN creation_source text NOT NULL DEFAULT 'unknown' CHECK (creation_source IN ('unknown', 'manual', 'import', 'whatsapp'))`,
    );
    await queryRunner.query(
      `ALTER TABLE public.appointments ADD COLUMN booking_source text NOT NULL DEFAULT 'unknown' CHECK (booking_source IN ('unknown', 'manual', 'whatsapp'))`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE public.appointments DROP COLUMN booking_source',
    );
    await queryRunner.query(
      'ALTER TABLE public.patients DROP COLUMN creation_source',
    );
  }
}
