"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api";
import type { PatientAntecedente } from "@/lib/types";

export interface PatientAntecedenteInput {
  antecedenteTypeId: string;
  detalle?: string;
}

export interface UpdatePatientAntecedentesState {
  error?: string;
  items?: PatientAntecedente[];
}

// Called imperatively from PatientAntecedentesCard (a client component),
// not bound to a <form> — same "the whole checklist submits its current
// state" shape as PUT /patients/:id/antecedentes itself (full replace, not
// a per-checkbox PATCH).
export async function updatePatientAntecedentesAction(
  patientId: string,
  items: PatientAntecedenteInput[],
): Promise<UpdatePatientAntecedentesState> {
  try {
    const result = await apiFetch<PatientAntecedente[]>(
      `/patients/${patientId}/antecedentes`,
      { method: "PUT", body: { items } },
    );
    revalidatePath(`/patients/${patientId}`);
    return { items: result };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "No se pudieron guardar los antecedentes." };
  }
}
