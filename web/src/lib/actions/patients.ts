"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import type { Patient } from "@/lib/types";

export interface PatientFormState {
  error?: string;
}

function patientPayloadFromFormData(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  return {
    // Trimmed here too so the UI doesn't round-trip to the API just to
    // find out a stray space made "00000002B" look new. The API also
    // trims (it's the guarantee that actually holds for every client),
    // this is just to avoid a needless request.
    firstName: String(formData.get("firstName") ?? "").trim(),
    lastName: String(formData.get("lastName") ?? "").trim(),
    documentId: String(formData.get("documentId") ?? "").trim(),
    dateOfBirth: String(formData.get("dateOfBirth") ?? ""),
    phone: String(formData.get("phone") ?? "").trim(),
    ...(email ? { email } : {}),
    ...(address ? { address } : {}),
    ...(notes ? { notes } : {}),
  };
}

export async function createPatientAction(
  _prevState: PatientFormState,
  formData: FormData,
): Promise<PatientFormState> {
  let patient: Patient;
  try {
    patient = await apiFetch<Patient>("/patients", {
      method: "POST",
      body: patientPayloadFromFormData(formData),
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo crear el paciente." };
  }

  revalidatePath("/patients");
  redirect(`/patients/${patient.id}`);
}

export async function updatePatientAction(
  id: string,
  _prevState: PatientFormState,
  formData: FormData,
): Promise<PatientFormState> {
  try {
    await apiFetch<Patient>(`/patients/${id}`, {
      method: "PATCH",
      body: patientPayloadFromFormData(formData),
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo actualizar el paciente." };
  }

  revalidatePath("/patients");
  revalidatePath(`/patients/${id}`);
  redirect(`/patients/${id}`);
}

export async function deletePatientAction(id: string): Promise<void> {
  await apiFetch(`/patients/${id}`, { method: "DELETE" });
  revalidatePath("/patients");
  redirect("/patients");
}

// Called imperatively from PatientPicker (a client component), not bound
// to a <form> — a plain async function a Client Component can invoke on
// every keystroke (debounced) is enough here; no need for useActionState.
export async function searchPatientsAction(query: string): Promise<Patient[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const result = await apiFetch<{ data: Patient[] }>(
    `/patients?search=${encodeURIComponent(trimmed)}&pageSize=10`,
  );
  return result.data;
}
