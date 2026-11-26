import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserAgendaView1737600000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("SET LOCAL lock_timeout = '5s'");
    await queryRunner.query(
      `ALTER TABLE iam.users ADD COLUMN agenda_view text NOT NULL DEFAULT 'month' CHECK (agenda_view IN ('day', 'week', 'month'))`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE iam.users DROP COLUMN agenda_view`);
  }
}
