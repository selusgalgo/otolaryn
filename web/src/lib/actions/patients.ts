"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, apiFetchMultipart, ApiError } from "@/lib/api";
import type { Patient } from "@/lib/types";

export interface PatientFormState {
  error?: string;
  success?: boolean;
}

function patientPayloadFromFormData(formData: FormData) {
  const documentId = String(formData.get("documentId") ?? "").trim();
  const phone2 = String(formData.get("phone2") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const province = String(formData.get("province") ?? "").trim();
  const postalCode = String(formData.get("postalCode") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const profession = String(formData.get("profession") ?? "").trim();
  const insuranceEntityId = String(formData.get("insuranceEntityId") ?? "").trim();
  const firstConsultationOverride = String(formData.get("firstConsultationOverride") ?? "").trim();

  return {
    // Trimmed here too so the UI doesn't round-trip to the API just to
    // find out a stray space made "00000002B" look new. The API also
    // trims (it's the guarantee that actually holds for every client),
    // this is just to avoid a needless request.
    firstName: String(formData.get("firstName") ?? "").trim(),
    lastName: String(formData.get("lastName") ?? "").trim(),
    dateOfBirth: String(formData.get("dateOfBirth") ?? ""),
    phone: String(formData.get("phone") ?? "").trim(),
    // Documento (and every other optional field below) sends an explicit
    // null when blank, not just an omitted key — updatePatientAction uses
    // this same payload for PATCH, and omitting the key there means
    // "leave it as it was", not "clear it": a DNI once set could never be
    // erased back to blank from the ficha. @IsOptional() on the backend
    // DTO already skips validation on null the same way it does on
    // undefined, so this changes nothing about what create() accepts.
    documentId: documentId || null,
    phone2: phone2 || null,
    email: email || null,
    address: address || null,
    city: city || null,
    province: province || null,
    postalCode: postalCode || null,
    notes: notes || null,
    profession: profession || null,
    insuranceEntityId: insuranceEntityId || null,
    firstConsultationOverride: firstConsultationOverride || null,
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

// Standalone action for the Notas card on the patient detail page — a
// plain patientPayloadFromFormData().notes would also send whatever the
// FormData happens to be missing (firstName, dateOfBirth, ...) as empty
// strings and overwrite the rest of the patient, since that helper is
// built for a full patient form. This sends only what changed.
export async function updatePatientNotesAction(
  id: string,
  _prevState: PatientFormState,
  formData: FormData,
): Promise<PatientFormState> {
  const notes = String(formData.get("notes") ?? "").trim();
  try {
    await apiFetch<Patient>(`/patients/${id}`, {
      method: "PATCH",
      body: { notes },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudieron guardar las notas." };
  }

  revalidatePath(`/patients/${id}`);
  return { success: true };
}

export interface ArchivePatientState {
  error?: string;
  success?: boolean;
}

// "Dar de baja"/soft-delete, never a real delete — the clinical history
// has to be kept for years. Called from a row menu on the patients list;
// revalidates and stays put instead of redirecting, since the list may be
// showing a page or search filter worth keeping.
export async function archivePatientAction(id: string): Promise<ArchivePatientState> {
  try {
    await apiFetch(`/patients/${id}`, { method: "DELETE" });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo archivar el paciente." };
  }
  revalidatePath("/patients");
  return { success: true };
}

export interface BulkDeletePatientsResult {
  deleted: number;
  skipped: { id: string; reason: string }[];
}

export interface BulkDeletePatientsState {
  error?: string;
  result?: BulkDeletePatientsResult;
}

// Runs from the list itself (PatientsTable), which needs to stay put and show how many
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

// Mirrors ImportJobProgress on the backend (see ImportJobsService) — a
// bulk import runs as a job processed in bounded batches, not inside one
// request, so a large legacy file doesn't blow through Vercel's 300s
// function timeout. `status: "completed"` is the signal to stop polling.
export interface ImportJobProgress {
  jobId: string;
  status: "running" | "completed";
  totalRows: number;
  processedRows: number;
  created: number;
  skipped: { row: number; reason: string }[];
}

export interface StartImportPatientsState {
  error?: string;
  progress?: ImportJobProgress;
}

// field -> the file's own header text, e.g. { legacyId: "NUMHISTORIA" }.
// insuranceEntityName/antecedentes aren't plain fields — they need
// resolution (name/value -> id) on the backend, not a straight copy, so
// they're modeled separately from the Partial<Record<...>> below (mirrors
// FieldMapping in patients-csv.util.ts).
export type ColumnMapping = Partial<
  Record<
    | "firstName"
    | "lastName"
    | "documentId"
    | "dateOfBirth"
    | "phone"
    | "phone2"
    | "email"
    | "address"
    | "city"
    | "province"
    | "postalCode"
    | "notes"
    | "profession"
    | "legacyId"
    | "firstConsultationOverride",
    string
  >
> & {
  insuranceEntityName?: string;
  // antecedenteTypeId -> the file's own column header for that antecedente.
  // Value is string | undefined (not a plain Record<string,string>) so a
  // cleared select can set a key to undefined instead of needing its own
  // delete — JSON.stringify drops undefined values when this is actually
  // sent, same as every other optional field here.
  antecedentes?: Record<string, string | undefined>;
};

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

// Step 2a: kicks off the import job and returns right away with its
// jobId/totalRows — it does not wait for any row to actually be created.
// Called imperatively (like previewPatientsImportAction above), not tied
// to useActionState: the dialog needs to start polling continueImportJobAction
// the moment this resolves, which a form-submission-shaped action isn't a
// good fit for.
export async function startImportPatientsAction(
  file: File,
  mapping: ColumnMapping,
): Promise<StartImportPatientsState> {
  const upstream = new FormData();
  upstream.set("file", file, file.name);
  upstream.set("mapping", JSON.stringify(mapping));

  try {
    const progress = await apiFetchMultipart<ImportJobProgress>("/patients/import", upstream);
    return { progress };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo importar el fichero." };
  }
}

// Step 2b: advances the job by one batch — the dialog calls this in a
// loop until `progress.status === "completed"`, updating its progress bar
// after each call. revalidatePath only fires once the job is actually
// done, not on every intermediate batch.
export async function continueImportJobAction(
  jobId: string,
): Promise<StartImportPatientsState> {
  try {
    const progress = await apiFetch<ImportJobProgress>(`/patients/import/${jobId}/continue`, {
      method: "POST",
    });
    if (progress.status === "completed") {
      revalidatePath("/patients");
    }
    return { progress };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo continuar la importación." };
  }
}

// Mirrors UpdateFieldMapping in patients-csv.util.ts — the narrow "update
// patients" mode only ever touches Primera consulta + antecedentes on an
// already-existing patient, located by Nº de historia, so its mapping has
// far fewer fields than the full ColumnMapping above.
export type UpdateColumnMapping = {
  legacyId?: string;
  firstConsultationOverride?: string;
  notes?: string;
  antecedentes?: Record<string, string | undefined>;
};

export interface UpdateImportPreview {
  headers: string[];
  sampleRows: Record<string, string>[];
  suggestedMapping: UpdateColumnMapping;
}

export interface PreviewPatientsUpdateState {
  error?: string;
  preview?: UpdateImportPreview;
}

export async function previewPatientsUpdateAction(
  formData: FormData,
): Promise<PreviewPatientsUpdateState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecciona un fichero." };
  }

  const upstream = new FormData();
  upstream.set("file", file, file.name);

  try {
    const preview = await apiFetchMultipart<UpdateImportPreview>(
      "/patients/import-update/preview",
      upstream,
    );
    return { preview };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo leer el fichero." };
  }
}

export interface StartUpdatePatientsState {
  error?: string;
  progress?: ImportJobProgress;
}

export async function startUpdatePatientsAction(
  file: File,
  mapping: UpdateColumnMapping,
): Promise<StartUpdatePatientsState> {
  const upstream = new FormData();
  upstream.set("file", file, file.name);
  upstream.set("mapping", JSON.stringify(mapping));

  try {
    const progress = await apiFetchMultipart<ImportJobProgress>(
      "/patients/import-update",
      upstream,
    );
    return { progress };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo importar el fichero." };
  }
}

export async function continueUpdateJobAction(
  jobId: string,
): Promise<StartUpdatePatientsState> {
  try {
    const progress = await apiFetch<ImportJobProgress>(
      `/patients/import-update/${jobId}/continue`,
      { method: "POST" },
    );
    if (progress.status === "completed") {
      revalidatePath("/patients");
    }
    return { progress };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo continuar la importación." };
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
