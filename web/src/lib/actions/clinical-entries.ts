"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import type { ClinicalEntry } from "@/lib/types";

export interface ClinicalEntryFormState {
  error?: string;
  // Solo lo usa el modo edición (ClinicalEntryForm's onSuccess) — crear
  // redirige en vez de devolver success, así que nunca lo necesita.
  success?: boolean;
}

export async function createClinicalEntryAction(
  patientId: string,
  _prevState: ClinicalEntryFormState,
  formData: FormData,
): Promise<ClinicalEntryFormState> {
  const visitDate = String(formData.get("visitDate") ?? "").trim();
  const examinationFindings = String(formData.get("examinationFindings") ?? "").trim();
  const diagnosis = String(formData.get("diagnosis") ?? "").trim();
  const treatment = String(formData.get("treatment") ?? "").trim();
  const followUpNotes = String(formData.get("followUpNotes") ?? "").trim();

  const body = {
    chiefComplaint: String(formData.get("chiefComplaint") ?? "").trim(),
    ...(visitDate ? { visitDate: new Date(visitDate).toISOString() } : {}),
    ...(examinationFindings ? { examinationFindings } : {}),
    ...(diagnosis ? { diagnosis } : {}),
    ...(treatment ? { treatment } : {}),
    ...(followUpNotes ? { followUpNotes } : {}),
  };

  let entry: ClinicalEntry;
  try {
    entry = await apiFetch<ClinicalEntry>(`/patients/${patientId}/clinical-entries`, {
      method: "POST",
      body,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo guardar la entrada." };
  }

  revalidatePath(`/patients/${patientId}`);
  redirect(`/patients/${patientId}/clinical-entries/${entry.id}`);
}

// admin/profesional (ver ClinicalEntriesController) — a diferencia de
// createClinicalEntryAction, los campos opcionales se mandan siempre
// (aunque vayan vacíos) en vez de omitirse cuando están en blanco: aquí
// "vacío" es una edición real (borrar un campo), no "nada que guardar
// todavía" como en el alta.
export async function updateClinicalEntryAction(
  patientId: string,
  entryId: string,
  _prevState: ClinicalEntryFormState,
  formData: FormData,
): Promise<ClinicalEntryFormState> {
  const visitDate = String(formData.get("visitDate") ?? "").trim();

  const body = {
    ...(visitDate ? { visitDate: new Date(visitDate).toISOString() } : {}),
    chiefComplaint: String(formData.get("chiefComplaint") ?? "").trim(),
    examinationFindings: String(formData.get("examinationFindings") ?? "").trim(),
    diagnosis: String(formData.get("diagnosis") ?? "").trim(),
    treatment: String(formData.get("treatment") ?? "").trim(),
    followUpNotes: String(formData.get("followUpNotes") ?? "").trim(),
  };

  try {
    await apiFetch<ClinicalEntry>(`/clinical-entries/${entryId}`, {
      method: "PATCH",
      body,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo guardar la consulta." };
  }

  revalidatePath(`/patients/${patientId}`);
  revalidatePath(`/patients/${patientId}/clinical-entries/${entryId}`);
  return { success: true };
}

// Admin only — el backend ya devuelve 403 para cualquier otro rol (ver
// ClinicalEntriesController). Soft delete: la consulta desaparece de la
// ficha del paciente, pero el registro no se borra de verdad.
export async function deleteClinicalEntryAction(
  patientId: string,
  entryId: string,
): Promise<void> {
  await apiFetch(`/clinical-entries/${entryId}`, { method: "DELETE" });
  revalidatePath(`/patients/${patientId}`);
  redirect(`/patients/${patientId}`);
}
