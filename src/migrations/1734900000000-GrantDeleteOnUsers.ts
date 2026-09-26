import { MigrationInterface, QueryRunner } from 'typeorm';

// otolaryn_app only ever got SELECT (InitSchema) and INSERT/UPDATE
// (RolesAndSuperadmin) on iam.users — nothing has ever deleted a user row,
// so DELETE was never granted. UsersService.remove needs it now.
export class GrantDeleteOnUsers1734900000000 implements MigrationInterface {
  name = 'GrantDeleteOnUsers1734900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`GRANT DELETE ON iam.users TO otolaryn_app`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`REVOKE DELETE ON iam.users FROM otolaryn_app`);
  }
}
