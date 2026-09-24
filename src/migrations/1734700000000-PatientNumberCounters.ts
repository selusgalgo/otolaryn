import { MigrationInterface, QueryRunner } from 'typeorm';

// El usuario reportó (24/09/2026) que un paciente creado directamente en la
// app (no vía el importador del legado) nunca recibe un "número de
// historia" — legacy_id se queda NULL para siempre, y es justo el dato que
// el personal de la clínica usa para relacionar todo (ver el comentario
// original en PatientsLegacyId1733700000000: "clinic staff still refer to
// patients by this number from memory"). A partir de ahora legacy_id deja
// de ser exclusivo de la migración histórica: PatientsService.create()
// asigna el siguiente número libre de la MISMA secuencia cuando el DTO no
// trae uno explícito (el importador de Pacientes lo sigue trayendo
// explícito cuando el legado tiene NUMHISTORIA — solo se auto-asigna
// cuando falta).
//
// patient_number_counters guarda, por tenant, el próximo número a asignar.
// Un INSERT ... ON CONFLICT DO UPDATE ... RETURNING (ver
// PatientsService.assignNextPatientNumber) es atómico en una sola
// sentencia — sin la carrera de leer MAX(...)+1 y escribirlo aparte, que
// dos altas simultáneas sí podrían pisarse. Misma forma RLS que el resto
// de tablas propias de un tenant (insurance_entities, antecedente_types).
export class PatientNumberCounters1734700000000 implements MigrationInterface {
  name = 'PatientNumberCounters1734700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE public.patient_number_counters (
        tenant_id uuid PRIMARY KEY REFERENCES iam.tenants(id) ON DELETE CASCADE,
        next_number integer NOT NULL DEFAULT 1
      )
    `);
    await queryRunner.query(
      `ALTER TABLE public.patient_number_counters ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE public.patient_number_counters FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON public.patient_number_counters
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    `);

    // Semilla: cada tenant arranca justo después del mayor legacy_id
    // NUMÉRICO que ya tenga — así no colisiona con nada del legado. 1 si no
    // tiene ninguno (tenant nuevo, o legado sin ni un legacy_id numérico).
    // legacy_id es texto libre (el legado trae algún valor no numérico
    // suelto) así que `~ '^[0-9]+$'` descarta esos antes del CAST en vez de
    // reventar la migración con uno solo que no sea un entero. Mismo baile
    // per-tenant con set_config que PatientAntecedentes1733900000000 —
    // patients también tiene FORCE ROW LEVEL SECURITY, incluso el owner
    // necesita el tenant fijado para poder leerla/escribirla.
    const tenants = (await queryRunner.query(`SELECT id FROM iam.tenants`)) as {
      id: string;
    }[];
    for (const tenant of tenants) {
      await queryRunner.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        tenant.id,
      ]);
      const [{ max }] = (await queryRunner.query(`
        SELECT max(legacy_id::int) AS max
        FROM public.patients
        WHERE legacy_id ~ '^[0-9]+$'
      `)) as { max: number | null }[];
      await queryRunner.query(
        `INSERT INTO public.patient_number_counters (tenant_id, next_number) VALUES ($1, $2)`,
        [tenant.id, (max ?? 0) + 1],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS public.patient_number_counters`,
    );
  }
}
