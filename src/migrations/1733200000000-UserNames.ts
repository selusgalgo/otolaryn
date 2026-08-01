import { MigrationInterface, QueryRunner } from 'typeorm';

// Needed for the Dashboard's "Hola, {nombre}" greeting — iam.users only had
// email until now. Assumes a fresh/dev database with no rows to preserve,
// same as PatientsRealFields1732950000000: local/CI databases need to be
// reset before running this NOT NULL addition.
export class UserNames1733200000000 implements MigrationInterface {
  name = 'UserNames1733200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.users
        ADD COLUMN first_name text NOT NULL,
        ADD COLUMN last_name text NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.users
        DROP COLUMN first_name,
        DROP COLUMN last_name
    `);
  }
}
