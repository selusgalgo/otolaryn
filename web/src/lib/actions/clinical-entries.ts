"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import type { ClinicalEntry } from "@/lib/types";

export interface ClinicalEntryFormState {
  error?: string;
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
