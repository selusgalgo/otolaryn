import { MigrationInterface, QueryRunner } from 'typeorm';

// Familiares a cargo: un paciente puede tener un "titular" (otro paciente de
// la misma clínica) y su parentesco con él. Caso real: el programa legado
// repetía el DNI del titular en hijos/cónyuges, que no tienen documento
// propio — y documento sigue siendo único por clínica
// (patients_tenant_document_id_idx), así que el familiar se queda sin DNI y
// se le vincula al titular, cuyo documento se muestra en su lugar.
//
//  - FK compuesta (holder_patient_id, tenant_id) -> patients(id, tenant_id):
//    la propia BD impide un titular de otra clínica, igual que las FKs de
//    clinical_entries/appointments hacia patients.
//  - ON DELETE SET NULL (holder_patient_id): borrar de verdad al titular
//    deja al familiar sin vínculo, nunca lo arrastra (requiere PG >= 15; el
//    proyecto usa 16). La baja normal es soft delete y no dispara esto.
//  - Ni el propio paciente como titular, ni parentesco sin titular. Que no
//    haya cadenas (titular que a su vez es familiar a cargo) lo valida
//    PatientsService — un CHECK no puede mirar otras filas.
export class PatientHolder1738000000000 implements MigrationInterface {
  name = 'PatientHolder1738000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients
        ADD COLUMN holder_patient_id uuid NULL,
        ADD COLUMN holder_relationship text NULL
          CONSTRAINT patients_holder_relationship_check
          CHECK (holder_relationship IN ('hijo', 'conyuge', 'otro')),
        ADD CONSTRAINT patients_holder_not_self
          CHECK (holder_patient_id IS NULL OR holder_patient_id <> id),
        ADD CONSTRAINT patients_holder_relationship_needs_holder
          CHECK (holder_relationship IS NULL OR holder_patient_id IS NOT NULL),
        ADD CONSTRAINT patients_holder_fk
          FOREIGN KEY (holder_patient_id, tenant_id)
          REFERENCES public.patients (id, tenant_id)
          ON DELETE SET NULL (holder_patient_id)
    `);
    // Sin esto, "familiares a cargo de X" recorrería toda la tabla.
    await queryRunner.query(`
      CREATE INDEX patients_holder_patient_id_idx
        ON public.patients (holder_patient_id)
        WHERE holder_patient_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX public.patients_holder_patient_id_idx`);
    await queryRunner.query(`
      ALTER TABLE public.patients
        DROP CONSTRAINT patients_holder_fk,
        DROP CONSTRAINT patients_holder_relationship_needs_holder,
        DROP CONSTRAINT patients_holder_not_self,
        DROP COLUMN holder_relationship,
        DROP COLUMN holder_patient_id
    `);
  }
}
