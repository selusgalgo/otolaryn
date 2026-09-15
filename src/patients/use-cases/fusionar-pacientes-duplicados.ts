import { EntityManager } from 'typeorm';

// Reassigns every child record (citas, historia clínica, antecedentes) from
// one or more duplicate patient rows onto a single survivor, then
// soft-deletes the duplicates — the real use case from the domain catalog
// (arquitectura_otolaryn_saas.md sección 4), not an ad-hoc merge.
//
// Takes a plain EntityManager rather than assuming a request-scoped
// TenancyContext because it has two callers with very different runtimes:
// a future admin-facing endpoint (an authenticated request, tenancyContext
// already scoped) and the historical data migration
// (src/database/migrate-legacy.ts), which runs as a standalone script with
// no HTTP request at all — it sets up its own RLS-scoped
// QueryRunner/EntityManager per tenant, the same way seed.ts does.
//
// patient_antecedentes has a UNIQUE(patient_id, antecedente_type_id) — if
// both the survivor and a duplicate already marked the same antecedente
// (e.g. both have "Tabaco"), reassigning the duplicate's row would violate
// that constraint. The survivor's own row wins in that case; the
// duplicate's conflicting row is left in place, attached to the now
// soft-deleted duplicate patient — not lost, just no longer the row in
// effect for the merged patient.
export async function fusionarPacientesDuplicados(
  manager: EntityManager,
  survivorId: string,
  duplicateIds: string[],
): Promise<void> {
  if (duplicateIds.length === 0) return;

  await manager.query(
    `UPDATE public.appointments SET patient_id = $1 WHERE patient_id = ANY($2)`,
    [survivorId, duplicateIds],
  );

  await manager.query(
    `UPDATE public.clinical_entries SET patient_id = $1 WHERE patient_id = ANY($2)`,
    [survivorId, duplicateIds],
  );

  await manager.query(
    `
    UPDATE public.patient_antecedentes pa
    SET patient_id = $1
    WHERE pa.patient_id = ANY($2)
      AND NOT EXISTS (
        SELECT 1 FROM public.patient_antecedentes survivor_pa
        WHERE survivor_pa.patient_id = $1
          AND survivor_pa.antecedente_type_id = pa.antecedente_type_id
      )
    `,
    [survivorId, duplicateIds],
  );

  await manager.query(
    `UPDATE public.patients SET deleted_at = now() WHERE id = ANY($1)`,
    [duplicateIds],
  );
}
