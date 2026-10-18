import { MigrationInterface, QueryRunner } from 'typeorm';

// "Fecha de primera consulta" is computed from MIN(clinical_entries.visit_date)
// (see PatientsService.findOneWithFirstConsultationDate) specifically so it
// can't drift from what Historia clínica actually says — but a patient
// migrated from the legacy system can have a real first-visit date with no
// corresponding clinical_entries row at all (the old system didn't always
// record one), leaving nothing to compute from. This column is a manual
// override for exactly that gap: when set, it wins over the computed value;
// when null (the common case), the computed value is still what's shown.
export class PatientFirstConsultationOverride1735700000000 implements MigrationInterface {
  name = 'PatientFirstConsultationOverride1735700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients
        ADD COLUMN first_consultation_override date
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients DROP COLUMN first_consultation_override
    `);
  }
}
