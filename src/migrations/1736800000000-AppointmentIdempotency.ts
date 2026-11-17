import { MigrationInterface, QueryRunner } from 'typeorm';

export class AppointmentIdempotency1736800000000 implements MigrationInterface {
  name = 'AppointmentIdempotency1736800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.appointments
      ADD COLUMN idempotency_key_hash text,
      ADD COLUMN idempotency_request_hash text`);
    await queryRunner.query(`CREATE UNIQUE INDEX appointments_tenant_idempotency_key
      ON public.appointments (tenant_id, idempotency_key_hash)
      WHERE idempotency_key_hash IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX public.appointments_tenant_idempotency_key',
    );
    await queryRunner.query(`ALTER TABLE public.appointments
      DROP COLUMN idempotency_request_hash,
      DROP COLUMN idempotency_key_hash`);
  }
}
