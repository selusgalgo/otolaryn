import { MigrationInterface, QueryRunner } from 'typeorm';

// Dos datos nuevos del paciente, ambos opcionales (los pacientes que ya
// existen quedan con NULL, "sin indicar" — no se inventa ningún valor):
//  - gender: 'hombre' | 'mujer'. CHECK en BD para que ningún cliente pueda
//    guardar otra cosa; el importador normaliza H/V/M/F/Hombre/Mujer antes.
//  - insurance_number: número de tarjeta/póliza del paciente en su
//    aseguradora privada (la aseguradora en sí ya es insurance_entity_id).
//    Texto libre: cada aseguradora usa su propio formato.
export class PatientGenderInsuranceNumber1737800000000 implements MigrationInterface {
  name = 'PatientGenderInsuranceNumber1737800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients
        ADD COLUMN gender text NULL
          CONSTRAINT patients_gender_check CHECK (gender IN ('hombre', 'mujer')),
        ADD COLUMN insurance_number text NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients
        DROP COLUMN insurance_number,
        DROP COLUMN gender
    `);
  }
}
