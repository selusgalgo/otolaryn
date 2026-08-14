import { MigrationInterface, QueryRunner } from 'typeorm';

// Supersedes ClinicSchedule1733500000000 entirely — open_days (a plain
// day-open/closed flag) can't express actual time ranges, so it's dropped
// in favour of a real table, same relational shape as every other business
// table here (patients, appointments) rather than JSON.
export class ClinicHoursSlots1733600000000 implements MigrationInterface {
  name = 'ClinicHoursSlots1733600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE iam.tenants DROP COLUMN open_days`);

    await queryRunner.query(`
      CREATE TABLE iam.clinic_hours (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
        weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Monday
        start_time time NOT NULL,
        end_time time NOT NULL,
        CHECK (end_time > start_time)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX clinic_hours_tenant_id_idx ON iam.clinic_hours (tenant_id)`,
    );
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON iam.clinic_hours TO otolaryn_app`,
    );

    // Backfill: every existing tenant gets a sensible default (Mon-Fri,
    // morning + afternoon) instead of ending up with no hours configured
    // at all right after this migration runs.
    await queryRunner.query(`
      INSERT INTO iam.clinic_hours (tenant_id, weekday, start_time, end_time)
      SELECT t.id, wd.weekday, slot.start_time, slot.end_time
      FROM iam.tenants t
      CROSS JOIN (VALUES (0),(1),(2),(3),(4)) AS wd(weekday)
      CROSS JOIN (VALUES ('09:00'::time,'13:00'::time), ('16:00'::time,'20:00'::time)) AS slot(start_time, end_time)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE iam.clinic_hours`);
    await queryRunner.query(`
      ALTER TABLE iam.tenants
        ADD COLUMN open_days boolean[] NOT NULL
        DEFAULT '{true,true,true,true,true,false,false}'
    `);
  }
}
