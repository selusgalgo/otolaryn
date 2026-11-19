import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackupConfiguration1737800000000 implements MigrationInterface {
  name = 'BackupConfiguration1737800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE iam.backup_configuration (
      id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      bucket text NOT NULL,
      region text NOT NULL,
      key_id_encrypted bytea NOT NULL,
      application_key_encrypted bytea NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid
    )`);
    await queryRunner.query(
      'REVOKE ALL ON iam.backup_configuration FROM PUBLIC',
    );
    await queryRunner.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON iam.backup_configuration TO otolaryn_app',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE iam.backup_configuration');
  }
}
