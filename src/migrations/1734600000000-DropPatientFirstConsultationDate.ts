import { MigrationInterface, QueryRunner } from 'typeorm';

// "Fecha de la primera consulta" is no longer a manually-entered column —
// it's derived from MIN(clinical_entries.visit_date) on every read (see
// PatientsService.findOneWithFirstConsultationDate), so it can't drift
// from what Historia clínica actually says.
export class DropPatientFirstConsultationDate1734600000000 implements MigrationInterface {
  name = 'DropPatientFirstConsultationDate1734600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients
        DROP COLUMN first_consultation_date
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients
        ADD COLUMN first_consultation_date date
    `);
  }
}
