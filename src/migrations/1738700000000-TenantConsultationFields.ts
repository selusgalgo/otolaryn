import { MigrationInterface, QueryRunner } from 'typeorm';

// Campos de consulta marcables por clínica (antes solo se elegía plantilla).
// consultation_fields NULL = la clínica usa los campos de su plantilla, así
// que ninguna clínica existente cambia. Con valor, es la lista exacta de
// campos que ve (siempre incluye chiefComplaint, obligatorio en toda consulta).
export class TenantConsultationFields1738700000000 implements MigrationInterface {
  name = 'TenantConsultationFields1738700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.tenants
        ADD COLUMN consultation_fields text[] NULL
          CONSTRAINT tenants_consultation_fields_check
          CHECK (
            consultation_fields IS NULL OR (
              consultation_fields @> ARRAY['chiefComplaint']
              AND consultation_fields <@ ARRAY[
                'chiefComplaint', 'examinationFindings', 'evolution',
                'diagnosis', 'treatment', 'report', 'followUpNotes',
                'referringDoctor'
              ]
            )
          )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE iam.tenants DROP COLUMN consultation_fields`,
    );
  }
}
