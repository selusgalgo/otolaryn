import { MigrationInterface, QueryRunner } from 'typeorm';

// "Médico habitual" turned out to add no real value once the patient page
// grew its own "Nueva cita" action — dropped rather than left unused.
export class DropPatientAssignedPractitioner1734500000000 implements MigrationInterface {
  name = 'DropPatientAssignedPractitioner1734500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients
        DROP COLUMN assigned_practitioner_id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients
        ADD COLUMN assigned_practitioner_id uuid REFERENCES iam.users(id)
    `);
  }
}
