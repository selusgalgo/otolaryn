import { MigrationInterface, QueryRunner } from 'typeorm';

// Two more per-patient fields the legacy desktop app tracked:
// - FPRIMERACONSULTA (first_consultation_date): present on the legacy
//   pacientes.xls, but there was nowhere to persist it until now.
// - "médico asignado" (assigned_practitioner_id): no legacy equivalent at
//   all — pacientes.xls has no doctor column (only consultas.xls does, per
//   visit) — this is a forward-looking field. Every migrated patient comes
//   in with it unset; staff fill it in from here on.
// Both additive, nullable, no backfill — same shape as every other
// legacy-adjacent column added on this branch (legacy_id,
// insurance_entity_id).
export class PatientAssignmentAndFirstVisit1734000000000 implements MigrationInterface {
  name = 'PatientAssignmentAndFirstVisit1734000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients
        ADD COLUMN first_consultation_date date,
        ADD COLUMN assigned_practitioner_id uuid REFERENCES iam.users(id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients
        DROP COLUMN assigned_practitioner_id,
        DROP COLUMN first_consultation_date
    `);
  }
}
