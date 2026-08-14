import { MigrationInterface, QueryRunner } from 'typeorm';

// Purely additive, same as Username1733400000000: NOT NULL with a DEFAULT
// applies to existing rows without a table rewrite in modern Postgres, so
// this needs no backfill dance and is safe to apply to production as-is.
// Index 0=Monday..6=Sunday — same convention the Escritorio calendar grid
// already uses (see AgendaCalendar, (date.getDay()+6)%7).
export class ClinicSchedule1733500000000 implements MigrationInterface {
  name = 'ClinicSchedule1733500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.tenants
        ADD COLUMN open_days boolean[] NOT NULL
        DEFAULT '{true,true,true,true,true,false,false}'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE iam.tenants DROP COLUMN open_days`);
  }
}
