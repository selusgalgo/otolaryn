import { MigrationInterface, QueryRunner } from 'typeorm';

// Lets an admin take a profesional out of the Agenda module entirely
// (can't see it, can't book/edit a cita) without touching their role or
// anything else — a clinic-specific policy decision, not a capability the
// app assumed every profesional needs. Meaningless for admin/recepcion
// (never checked for those roles, see AgendaAccessGuard), but the column
// isn't role-scoped at the DB level — UsersService.update() is what keeps
// it forced to true outside role 'profesional'. Defaults true so every
// existing profesional keeps working exactly as before until an admin
// deliberately turns it off for someone.
export class UserAgendaAccess1735800000000 implements MigrationInterface {
  name = 'UserAgendaAccess1735800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.users
        ADD COLUMN agenda_access boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.users DROP COLUMN agenda_access
    `);
  }
}
