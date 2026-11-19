import { MigrationInterface, QueryRunner } from 'typeorm';

// Plantillas de consulta por clínica (ver clinical-entries/consultation-template.ts):
//  - iam.tenants.consultation_template: qué campos ve cada clínica en sus
//    consultas. Toda clínica existente queda en 'orl' (los cinco campos de
//    siempre), así que nadie nota ningún cambio hasta que superadmin elija
//    otra plantilla para una clínica concreta.
//  - Tres campos nuevos de consulta, todos opcionales, que usa la plantilla
//    de cirugía: evolution (Evolución) y report (Informe), ambos rich text
//    como Exploración/Tratamiento, y referring_doctor (Doctor que lo envía),
//    texto libre. "Enfermedad actual" NO es una columna nueva: es el mismo
//    chief_complaint de siempre, solo con otra etiqueta en esa plantilla.
export class ConsultationTemplates1737900000000 implements MigrationInterface {
  name = 'ConsultationTemplates1737900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.tenants
        ADD COLUMN consultation_template text NOT NULL DEFAULT 'orl'
          CONSTRAINT tenants_consultation_template_check
          CHECK (consultation_template IN ('orl', 'cirugia'))
    `);
    await queryRunner.query(`
      ALTER TABLE public.clinical_entries
        ADD COLUMN evolution text NULL,
        ADD COLUMN report text NULL,
        ADD COLUMN referring_doctor text NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.clinical_entries
        DROP COLUMN referring_doctor,
        DROP COLUMN report,
        DROP COLUMN evolution
    `);
    await queryRunner.query(`
      ALTER TABLE iam.tenants DROP COLUMN consultation_template
    `);
  }
}
