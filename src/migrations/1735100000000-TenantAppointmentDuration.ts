import { MigrationInterface, QueryRunner } from 'typeorm';

// Lets each clinic configure the duration a new appointment starts out
// with — AppointmentsService.create() and the web form both hardcoded 30
// until now. Stored on iam.tenants (no RLS there, same as every other
// per-clinic setting — ClinicHour, open_days before it) rather than a
// one-row-per-tenant settings table, since it's a single scalar.
export class TenantAppointmentDuration1735100000000 implements MigrationInterface {
  name = 'TenantAppointmentDuration1735100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.tenants
        ADD COLUMN default_appointment_duration_minutes smallint NOT NULL DEFAULT 30
        CHECK (default_appointment_duration_minutes BETWEEN 5 AND 480)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.tenants DROP COLUMN default_appointment_duration_minutes
    `);
  }
}
