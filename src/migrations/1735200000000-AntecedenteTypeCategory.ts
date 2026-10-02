import { MigrationInterface, QueryRunner } from 'typeorm';

// Splits the single antecedentes catalog into two independent categories —
// personal (the 13 legacy columns this catalog always was, see
// PatientAntecedentes1733900000000) and familiar, brand new. Reuses the
// same antecedente_types/patient_antecedentes tables with a discriminator
// column rather than a parallel set of tables: the replace-by-category
// scoping this enables lives in AntecedentesService.replaceForPatient.
export class AntecedenteTypeCategory1735200000000 implements MigrationInterface {
  name = 'AntecedenteTypeCategory1735200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.antecedente_types
        ADD COLUMN category text NOT NULL DEFAULT 'personal'
        CHECK (category IN ('personal', 'familiar'))
    `);

    // The old index let two types share a name only if they weren't the
    // same name twice for one tenant — now that's scoped per category too,
    // so a personal "Otras" and a familiar "Otras" can coexist.
    await queryRunner.query(
      `DROP INDEX public.antecedente_types_tenant_name_idx`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX antecedente_types_tenant_category_name_idx
        ON public.antecedente_types (tenant_id, category, lower(name))
    `);

    // Backfill: every existing tenant gets a starter familiar catalog, same
    // "seed every tenant" intent (and same per-tenant set_config loop,
    // required by this table's FORCE ROW LEVEL SECURITY) as
    // PatientAntecedentes1733900000000 used for the personal list.
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
        VALUES
          ($1, 'Hipoacusia/sordera familiar', 'familiar', 0),
          ($1, 'Alergias familiares', 'familiar', 1),
          ($1, 'Diabetes familiar', 'familiar', 2),
          ($1, 'Enfermedades cardiovasculares familiares', 'familiar', 3),
          ($1, 'Asma familiar', 'familiar', 4),
          ($1, 'Cáncer familiar', 'familiar', 5),
          ($1, 'Otras', 'familiar', 6)
      `,
        [tenant.id],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM public.antecedente_types WHERE category = 'familiar'`,
    );
    await queryRunner.query(
      `DROP INDEX public.antecedente_types_tenant_category_name_idx`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX antecedente_types_tenant_name_idx
        ON public.antecedente_types (tenant_id, lower(name))
    `);
    await queryRunner.query(
      `ALTER TABLE public.antecedente_types DROP COLUMN category`,
    );
  }
}
