import { MigrationInterface, QueryRunner } from 'typeorm';

// Introduces the real role model: superadmin (Eiduo staff, not tied to any
// tenant), admin, profesional and recepcion (both tenant-scoped). Today's
// 'staff' rows are all practitioners in practice, so they're renamed to
// 'profesional' rather than kept as a fifth, redundant value.
export class RolesAndSuperadmin1733300000000 implements MigrationInterface {
  name = 'RolesAndSuperadmin1733300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // NOT VALID skips checking existing rows immediately — required here
    // because 'staff' rows still exist and aren't in the new list yet, and
    // ADD CONSTRAINT otherwise validates the whole table synchronously
    // before the UPDATE below ever runs. VALIDATE CONSTRAINT afterwards
    // closes that gap once every row has been renamed.
    await queryRunner.query(
      `ALTER TABLE iam.users DROP CONSTRAINT users_role_check`,
    );
    await queryRunner.query(`
      ALTER TABLE iam.users
        ADD CONSTRAINT users_role_check
        CHECK (role IN ('superadmin', 'admin', 'profesional', 'recepcion'))
        NOT VALID
    `);
    await queryRunner.query(
      `ALTER TABLE iam.users ALTER COLUMN role SET DEFAULT 'profesional'`,
    );

    await queryRunner.query(
      `UPDATE iam.users SET role = 'profesional' WHERE role = 'staff'`,
    );

    await queryRunner.query(
      `ALTER TABLE iam.users VALIDATE CONSTRAINT users_role_check`,
    );

    // superadmin operates across every tenant, so it can't carry a single
    // tenant_id — every other role still must.
    await queryRunner.query(
      `ALTER TABLE iam.users ALTER COLUMN tenant_id DROP NOT NULL`,
    );

    await queryRunner.query(`
      ALTER TABLE iam.users
        ADD CONSTRAINT users_tenant_superadmin_check
        CHECK (
          (role = 'superadmin' AND tenant_id IS NULL) OR
          (role <> 'superadmin' AND tenant_id IS NOT NULL)
        )
    `);

    // iam.tenants/iam.users were SELECT-only for the app role until now —
    // nothing but the (owner-run) seed script ever wrote to them. The new
    // /users and /platform/tenants endpoints write through the app role, so
    // it needs INSERT/UPDATE too. Still no DELETE: users and tenants are
    // deactivated, never removed, by anything this app does.
    await queryRunner.query(
      `GRANT INSERT, UPDATE ON iam.tenants, iam.users TO otolaryn_app`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `REVOKE INSERT, UPDATE ON iam.tenants, iam.users FROM otolaryn_app`,
    );

    await queryRunner.query(
      `ALTER TABLE iam.users DROP CONSTRAINT users_tenant_superadmin_check`,
    );

    // Same NOT VALID / VALIDATE dance as up(), mirrored. Best-effort only:
    // this rolls back cleanly as long as no superadmin/recepcion rows exist
    // yet (their tenant_id/role wouldn't satisfy the old, narrower shape
    // restored below).
    await queryRunner.query(
      `ALTER TABLE iam.users DROP CONSTRAINT users_role_check`,
    );
    await queryRunner.query(`
      ALTER TABLE iam.users
        ADD CONSTRAINT users_role_check
        CHECK (role IN ('admin', 'staff'))
        NOT VALID
    `);
    await queryRunner.query(
      `ALTER TABLE iam.users ALTER COLUMN role SET DEFAULT 'staff'`,
    );

    await queryRunner.query(
      `UPDATE iam.users SET role = 'staff' WHERE role = 'profesional'`,
    );

    await queryRunner.query(
      `ALTER TABLE iam.users VALIDATE CONSTRAINT users_role_check`,
    );

    await queryRunner.query(
      `ALTER TABLE iam.users ALTER COLUMN tenant_id SET NOT NULL`,
    );
  }
}
