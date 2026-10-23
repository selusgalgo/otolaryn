import { MigrationInterface, QueryRunner } from 'typeorm';

// Lets admin/recepcion remove an appointment outright (a duplicate, a
// mistaken booking) instead of only "Cancelada" — cancelling stays the
// normal way to free a slot and keep the cita visible in history; this is
// for when the row itself shouldn't have existed. Soft delete, same
// pattern as Patient.deletedAt/ClinicalEntry.deletedAt: the row survives,
// TypeORM's query builder just stops returning it.
export class AppointmentSoftDelete1736000000000 implements MigrationInterface {
  name = 'AppointmentSoftDelete1736000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.appointments
        ADD COLUMN deleted_at timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.appointments DROP COLUMN deleted_at
    `);
  }
}
