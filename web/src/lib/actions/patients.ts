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
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    documentId: String(formData.get("documentId") ?? ""),
    dateOfBirth: String(formData.get("dateOfBirth") ?? ""),
    phone: String(formData.get("phone") ?? ""),
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
