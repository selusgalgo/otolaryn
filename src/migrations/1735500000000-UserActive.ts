import { MigrationInterface, QueryRunner } from 'typeorm';

// Lets an admin deactivate a profesional who's left the clinic without
// touching their history: appointments.practitioner_id and
// clinical_entries.author_user_id both reference iam.users.id with no
// ON DELETE action (see those migrations), so the row itself was always
// going to have to stay — this just adds a flag to block login and drop
// them out of the "Profesional" picker, rather than requiring a hard
// delete that the app already refuses once real history exists (see
// UsersService.remove). Defaults true so every existing user keeps
// working exactly as before.
export class UserActive1735500000000 implements MigrationInterface {
  name = 'UserActive1735500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.users
        ADD COLUMN active boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.users DROP COLUMN active
    `);
  }
}
