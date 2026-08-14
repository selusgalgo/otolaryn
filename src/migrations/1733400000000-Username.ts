import { MigrationInterface, QueryRunner } from 'typeorm';

// Purely additive — nullable column + a partial unique index, nothing to
// backfill and nothing existing can violate it, so (unlike the roles
// migration) this needs no NOT VALID/VALIDATE dance and is safe to apply
// to production exactly as written here.
export class Username1733400000000 implements MigrationInterface {
  name = 'Username1733400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE iam.users ADD COLUMN username text`);

    // Partial: WHERE username IS NOT NULL lets any number of rows leave it
    // unset (email-only login stays valid), while still enforcing
    // uniqueness among whoever does set one.
    await queryRunner.query(`
      CREATE UNIQUE INDEX users_username_lower_idx
        ON iam.users (lower(username))
        WHERE username IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX iam.users_username_lower_idx`);
    await queryRunner.query(`ALTER TABLE iam.users DROP COLUMN username`);
  }
}
