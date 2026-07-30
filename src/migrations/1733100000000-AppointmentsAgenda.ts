import { MigrationInterface, QueryRunner } from 'typeorm';

// Turns the spike's placeholder appointments table into a real agenda:
// an optional practitioner, a duration, a status, and — the part that
// actually matters for a scheduling system — a database-level guarantee
// that the same practitioner can never be double-booked. That guarantee
// is enforced with a GiST exclusion constraint rather than an
// application-level "check then insert", because the latter has a
// race window under concurrent booking attempts that this doesn't.
export class AppointmentsAgenda1733100000000 implements MigrationInterface {
  name = 'AppointmentsAgenda1733100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // btree_gist adds a GiST-compatible equality operator class for
    // scalar types like uuid, which the exclusion constraint below needs
    // to combine "same practitioner" (equality) with "overlapping time
    // range" (range overlap) in a single index.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);

    await queryRunner.query(`
      ALTER TABLE public.appointments
        ADD COLUMN practitioner_id uuid REFERENCES iam.users(id),
        ADD COLUMN duration_minutes integer NOT NULL DEFAULT 30,
        ADD COLUMN status text NOT NULL DEFAULT 'scheduled'
          CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show'))
    `);

    // Postgres marks timestamptz + interval as STABLE, not IMMUTABLE
    // (interval arithmetic can be timezone-sensitive in general), so it's
    // rejected directly inside an index expression. Here the interval is
    // always a plain minute count — no months/days involved — so adding it
    // to an absolute instant is genuinely deterministic; this wrapper just
    // asserts that to Postgres explicitly.
    await queryRunner.query(`
      CREATE FUNCTION appointment_time_range(scheduled_at timestamptz, duration_minutes integer)
      RETURNS tstzrange
      LANGUAGE sql
      IMMUTABLE
      AS $$
        SELECT tstzrange(scheduled_at, scheduled_at + (duration_minutes * interval '1 minute'));
      $$
    `);

    // Partial: only applies when a practitioner is actually assigned
    // (unassigned appointments aren't double-booking anyone) and only to
    // non-cancelled appointments (a cancelled slot doesn't block a new
    // booking in the same time range).
    await queryRunner.query(`
      ALTER TABLE public.appointments
        ADD CONSTRAINT appointments_no_double_booking
        EXCLUDE USING gist (
          practitioner_id WITH =,
          appointment_time_range(scheduled_at, duration_minutes) WITH &&
        )
        WHERE (practitioner_id IS NOT NULL AND status <> 'cancelled')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.appointments DROP CONSTRAINT appointments_no_double_booking
    `);
    await queryRunner.query(
      `DROP FUNCTION appointment_time_range(timestamptz, integer)`,
    );
    await queryRunner.query(`
      ALTER TABLE public.appointments
        DROP COLUMN practitioner_id,
        DROP COLUMN duration_minutes,
        DROP COLUMN status
    `);
  }
}
