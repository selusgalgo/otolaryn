import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackupHistory1737900000000 implements MigrationInterface {
  name = 'BackupHistory1737900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE iam.backup_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      mode text NOT NULL CHECK (mode IN ('manual', 'daily', 'pre_restore')),
      status text NOT NULL CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
      schedule_day date,
      started_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz,
      actor_id uuid,
      tenant_count integer NOT NULL DEFAULT 0,
      success_count integer NOT NULL DEFAULT 0,
      error_summary text
    )`);
    await queryRunner.query(
      'CREATE UNIQUE INDEX backup_runs_schedule_day_idx ON iam.backup_runs (schedule_day) WHERE schedule_day IS NOT NULL',
    );
    await queryRunner.query(`CREATE TABLE iam.backup_artifacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id uuid NOT NULL REFERENCES iam.backup_runs(id) ON DELETE CASCADE,
      tenant_id uuid NOT NULL,
      tenant_name text NOT NULL,
      object_key text NOT NULL UNIQUE,
      size_bytes bigint,
      sha256 text,
      status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
      created_at timestamptz NOT NULL DEFAULT now(),
      error_summary text
    )`);
    await queryRunner.query(
      'CREATE INDEX backup_artifacts_tenant_created_idx ON iam.backup_artifacts (tenant_id, created_at DESC)',
    );
    await queryRunner.query(`CREATE TABLE iam.backup_restorations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      artifact_id uuid NOT NULL REFERENCES iam.backup_artifacts(id) ON DELETE CASCADE,
      tenant_id uuid NOT NULL,
      tenant_name text NOT NULL,
      status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
      started_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz,
      actor_id uuid,
      safety_artifact_id uuid REFERENCES iam.backup_artifacts(id) ON DELETE SET NULL,
      error_summary text
    )`);
    await queryRunner.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON iam.backup_runs, iam.backup_artifacts, iam.backup_restorations TO otolaryn_app',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE iam.backup_restorations');
    await queryRunner.query('DROP TABLE iam.backup_artifacts');
    await queryRunner.query('DROP TABLE iam.backup_runs');
  }
}
