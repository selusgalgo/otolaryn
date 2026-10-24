import { MigrationInterface, QueryRunner } from 'typeorm';

// Lets a clinic opt in to restricting its profesional-role users to
// pre-authorized computers (admin generates a one-time install link,
// visiting it on a computer stores a long-lived credential in its
// browser; any login/request from a profesional that doesn't carry a
// matching credential is rejected). Per-tenant and off by default — most
// clinics never touch this; admin/recepcion are never affected by it
// regardless. device_secret_hash stays null until an admin actually
// generates a credential (argon2 hash, never the raw value — same
// reasoning as password_hash), and enforcement only ever kicks in once
// BOTH device_lock_enabled is true AND a hash exists — toggling the
// switch on before generating a credential must never lock every
// profesional out clinic-wide.
export class TenantDeviceLock1736100000000 implements MigrationInterface {
  name = 'TenantDeviceLock1736100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.tenants
        ADD COLUMN device_lock_enabled boolean NOT NULL DEFAULT false,
        ADD COLUMN device_secret_hash text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.tenants
        DROP COLUMN device_lock_enabled,
        DROP COLUMN device_secret_hash
    `);
  }
}
