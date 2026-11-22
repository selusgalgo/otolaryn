import { MigrationInterface, QueryRunner } from 'typeorm';

// Alergias medicamentosas y medicación actual como campos propios de la
// ficha del paciente (antes "Alergias medicamentosas" era un antecedente
// personal más, perdido en la lista). Son texto libre y opcionales; NULL =
// sin registrar.
//
// Los datos que ya existían como antecedente personal "Alergias
// medicamentosas" se MUEVEN al campo nuevo: el detalle pasa a drug_allergies
// (si estaba marcado sin detalle, queda "Sí") y se quitan la marca del
// paciente y el tipo del catálogo, para que el dato no aparezca duplicado.
// patient_antecedentes y antecedente_types tienen FORCE ROW LEVEL SECURITY,
// así que se hace tenant a tenant con set_config, como en las migraciones
// que las crearon.
const TYPE_IS_ALLERGY = `t.category = 'personal' AND lower(btrim(t.name)) = 'alergias medicamentosas'`;

export class PatientAllergiesMedications1738600000000 implements MigrationInterface {
  name = 'PatientAllergiesMedications1738600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients
        ADD COLUMN drug_allergies text NULL,
        ADD COLUMN current_medications text NULL
    `);

    const tenants = (await queryRunner.query(`SELECT id FROM iam.tenants`)) as {
      id: string;
    }[];
    for (const tenant of tenants) {
      await queryRunner.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        tenant.id,
      ]);
      await queryRunner.query(
        `
        UPDATE public.patients p
           SET drug_allergies = COALESCE(NULLIF(btrim(pa.detalle), ''), 'Sí')
          FROM public.patient_antecedentes pa
          JOIN public.antecedente_types t ON t.id = pa.antecedente_type_id
         WHERE pa.patient_id = p.id
           AND pa.tenant_id = p.tenant_id
           AND p.tenant_id = $1
           AND ${TYPE_IS_ALLERGY}
        `,
        [tenant.id],
      );
      await queryRunner.query(`
        DELETE FROM public.patient_antecedentes pa
         USING public.antecedente_types t
         WHERE t.id = pa.antecedente_type_id AND ${TYPE_IS_ALLERGY}
      `);
      await queryRunner.query(`
        DELETE FROM public.antecedente_types t WHERE ${TYPE_IS_ALLERGY}
      `);
    }
  }

  // Devuelve los datos al antecedente (el texto del campo pasa a ser el
  // detalle) y recrea el tipo en cada clínica, al final de la lista.
  public async down(queryRunner: QueryRunner): Promise<void> {
    const tenants = (await queryRunner.query(`SELECT id FROM iam.tenants`)) as {
      id: string;
    }[];
    for (const tenant of tenants) {
      await queryRunner.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        tenant.id,
      ]);
      await queryRunner.query(
        `
        INSERT INTO public.antecedente_types (tenant_id, name, category, display_order)
        SELECT $1, 'Alergias medicamentosas', 'personal',
               COALESCE(MAX(display_order), -1) + 1
          FROM public.antecedente_types
         WHERE tenant_id = $1 AND category = 'personal'
        ON CONFLICT DO NOTHING
        `,
        [tenant.id],
      );
      await queryRunner.query(
        `
        INSERT INTO public.patient_antecedentes (tenant_id, patient_id, antecedente_type_id, detalle)
        SELECT p.tenant_id, p.id, t.id, p.drug_allergies
          FROM public.patients p
          JOIN public.antecedente_types t ON t.tenant_id = p.tenant_id
         WHERE p.tenant_id = $1
           AND p.drug_allergies IS NOT NULL
           AND ${TYPE_IS_ALLERGY}
        `,
        [tenant.id],
      );
    }
    await queryRunner.query(`
      ALTER TABLE public.patients
        DROP COLUMN current_medications,
        DROP COLUMN drug_allergies
    `);
  }
}
