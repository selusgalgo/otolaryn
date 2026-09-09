"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch, apiFetchMultipart, ApiError } from "@/lib/api";
import type { Patient } from "@/lib/types";

export interface PatientFormState {
  error?: string;
  success?: boolean;
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

// Both actions below back modal forms (creation from the patients list,
// editing from the patient's own detail page) — they revalidate and
// report success instead of redirecting, so the dialog can just close
// itself and let the page underneath refresh in place.
export async function createPatientAction(
  _prevState: PatientFormState,
  formData: FormData,
): Promise<PatientFormState> {
  try {
    await apiFetch<Patient>("/patients", {
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
  return { success: true };
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
  return { success: true };
}

export async function deletePatientAction(id: string): Promise<void> {
  await apiFetch(`/patients/${id}`, { method: "DELETE" });
  revalidatePath("/patients");
  redirect("/patients");
}

export interface BulkDeletePatientsResult {
  deleted: number;
  skipped: { id: string; reason: string }[];
}

export interface BulkDeletePatientsState {
  error?: string;
  result?: BulkDeletePatientsResult;
}

// Unlike deletePatientAction above, doesn't redirect — this runs from the
// list itself (PatientsTable), which needs to stay put and show how many
// of the selection actually went through, since "some ids skipped" is a
// real outcome (someone else already discharged one, a profesional
// selected a patient outside their own visibility) and not just success
// or failure.
export async function bulkDeletePatientsAction(ids: string[]): Promise<BulkDeletePatientsState> {
  try {
    const result = await apiFetch<BulkDeletePatientsResult>("/patients/bulk-delete", {
      method: "POST",
      body: { ids },
    });
    revalidatePath("/patients");
    return { result };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo completar la baja masiva." };
  }
}

export interface ImportPatientsResult {
  totalRows: number;
  created: number;
  skipped: { row: number; reason: string }[];
}

export interface ImportPatientsState {
  error?: string;
  result?: ImportPatientsResult;
}

// field -> the file's own header text, e.g. { documentId: "NUMHISTORIA" }.
export type ColumnMapping = Partial<
  Record<"firstName" | "lastName" | "documentId" | "dateOfBirth" | "phone" | "email" | "address" | "notes", string>
>;

export interface ImportPreview {
  headers: string[];
  sampleRows: Record<string, string>[];
  suggestedMapping: ColumnMapping;
}

export interface PreviewPatientsImportState {
  error?: string;
  preview?: ImportPreview;
}

// Step 1 of the import wizard: reads the file's real columns and a few
// sample rows without importing anything, so the dialog can show a mapping
// step before any patient is actually created. Called imperatively (like
// searchPatientsAction below) whenever a file is dropped/picked, not tied
// to useActionState — there's no <form> submission at this point yet.
export async function previewPatientsImportAction(formData: FormData): Promise<PreviewPatientsImportState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecciona un fichero." };
  }

  const upstream = new FormData();
  upstream.set("file", file, file.name);

  try {
    const preview = await apiFetchMultipart<ImportPreview>("/patients/import/preview", upstream);
    return { preview };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo leer el fichero." };
  }
}

// Step 2: the actual import, using the column mapping the user confirmed
// in the wizard (a "mapping" field carrying the ColumnMapping as JSON —
// see ImportPatientsDialog). Unlike the create/update actions above, a
// successful call still reports through `result` (not just
// `success: true`): a partial import (some rows skipped) is the expected
// common case, not an error, and the user needs to see which rows and why
// before the dialog closes.
export async function importPatientsAction(
  _prevState: ImportPatientsState,
  formData: FormData,
): Promise<ImportPatientsState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecciona un fichero." };
  }

  const upstream = new FormData();
  upstream.set("file", file, file.name);
  const mapping = formData.get("mapping");
  if (typeof mapping === "string" && mapping) {
    upstream.set("mapping", mapping);
  }

  try {
    const result = await apiFetchMultipart<ImportPatientsResult>("/patients/import", upstream);
    revalidatePath("/patients");
    return { result };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo importar el fichero." };
  }
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
