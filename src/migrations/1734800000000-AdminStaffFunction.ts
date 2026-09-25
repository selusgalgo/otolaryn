import { MigrationInterface, QueryRunner } from 'typeorm';

// Some clinics are small enough that the owner (role 'admin') also sees
// patients themselves — until now that meant either losing admin access
// (becoming 'profesional' instead) or never showing up as a bookable
// doctor (the practitioner picker, GET /users?bookable=true, only ever
// looked at role='profesional'). Deliberately NOT a second role or a
// multi-role model: role keeps meaning exactly what it already means
// (access level), and staff_function is purely additive — an admin with
// staff_function='profesional' keeps every admin capability and also
// becomes bookable, same as any 'profesional'. Only meaningful for
// role='admin' (a 'profesional'/'recepcion' row already says which one it
// is via role itself); the CHECK below enforces that at the DB level
// rather than trusting every write path to remember it.
export class AdminStaffFunction1734800000000 implements MigrationInterface {
  name = 'AdminStaffFunction1734800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.users
        ADD COLUMN staff_function text,
        ADD CONSTRAINT users_staff_function_check
          CHECK (staff_function IS NULL OR staff_function IN ('profesional', 'recepcion')),
        ADD CONSTRAINT users_staff_function_admin_only_check
          CHECK (staff_function IS NULL OR role = 'admin')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.users
        DROP CONSTRAINT users_staff_function_admin_only_check,
        DROP CONSTRAINT users_staff_function_check,
        DROP COLUMN staff_function
    `);
  }
}
