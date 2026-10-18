"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, apiFetchMultipart, ApiError } from "@/lib/api";

// field -> the file's own header text, e.g. { patientLegacyId: "NUMHISTORIA" }.
// insuranceEntityName/doctorName aren't plain fields either — same
// "resolved server-side" reasoning as ColumnMapping.insuranceEntityName in
// lib/actions/patients.ts.
export interface ClinicalEntryColumnMapping {
  chiefComplaint?: string;
  examinationFindings?: string;
  treatment?: string;
  visitDate?: string;
  patientLegacyId?: string;
  patientFirstName?: string;
  patientLastName?: string;
  insuranceEntityName?: string;
  doctorName?: string;
}

export interface ClinicalEntriesImportPreview {
  headers: string[];
  sampleRows: Record<string, string>[];
  suggestedMapping: ClinicalEntryColumnMapping;
}

export interface PreviewClinicalEntriesState {
  error?: string;
  preview?: ClinicalEntriesImportPreview;
}

// Step 1 of the wizard: read the file's real columns without importing
// anything, same shape as previewPatientsImportAction.
export async function previewClinicalEntriesImportAction(
  formData: FormData,
): Promise<PreviewClinicalEntriesState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecciona un fichero." };
  }
  const upstream = new FormData();
  upstream.set("file", file, file.name);
  try {
    const preview = await apiFetchMultipart<ClinicalEntriesImportPreview>(
      "/clinical-entries/import/preview",
      upstream,
    );
    return { preview };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "No se pudo leer el fichero." };
  }
}

export interface DistinctDoctorsState {
  error?: string;
  doctorNames?: string[];
}

// Step 2: once the DOCTOR column is chosen, read every distinct name in
// the *whole* file (not just the 5-row preview sample) so the wizard can
// ask which real profesional each one maps to.
export async function getDistinctDoctorsAction(
  file: File,
  mapping: ClinicalEntryColumnMapping,
): Promise<DistinctDoctorsState> {
  const upstream = new FormData();
  upstream.set("file", file, file.name);
  upstream.set("mapping", JSON.stringify(mapping));
  try {
    const result = await apiFetchMultipart<{ doctorNames: string[] }>(
      "/clinical-entries/import/doctors",
      upstream,
    );
    return { doctorNames: result.doctorNames };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "No se pudieron leer los médicos del fichero." };
  }
}

// Mirrors ImportJobProgress on the backend (see ImportJobsService) — same
// batched-job reasoning as the Pacientes importer: a legacy consultas.xls
// has thousands of rows, each needing its own sequential DB round trips,
// which blows through Vercel's 300s function timeout if run as one
// request. `status: "completed"` is the signal to stop polling.
export interface ImportJobProgress {
  jobId: string;
  status: "running" | "completed";
  totalRows: number;
  processedRows: number;
  created: number;
  skipped: { row: number; reason: string }[];
}

export interface StartImportClinicalEntriesState {
  error?: string;
  progress?: ImportJobProgress;
}

// Step 3a: kicks off the import job (mapping + doctorMapping both
// confirmed in the wizard) and returns immediately with its
// jobId/totalRows — no row is actually created yet.
export async function startImportClinicalEntriesAction(
  file: File,
  mapping: ClinicalEntryColumnMapping,
  doctorMapping: Record<string, string>,
): Promise<StartImportClinicalEntriesState> {
  const upstream = new FormData();
  upstream.set("file", file, file.name);
  upstream.set("mapping", JSON.stringify(mapping));
  upstream.set("doctorMapping", JSON.stringify(doctorMapping));
  try {
    const progress = await apiFetchMultipart<ImportJobProgress>(
      "/clinical-entries/import",
      upstream,
    );
    return { progress };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "No se pudo importar el fichero." };
  }
}

// Step 3b: advances the job by one batch — the dialog calls this in a
// loop until `progress.status === "completed"`, updating its progress bar
// after each call.
export async function continueClinicalEntriesImportJobAction(
  jobId: string,
): Promise<StartImportClinicalEntriesState> {
  try {
    const progress = await apiFetch<ImportJobProgress>(
      `/clinical-entries/import/${jobId}/continue`,
      { method: "POST" },
    );
    if (progress.status === "completed") {
      revalidatePath("/patients");
    }
    return { progress };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "No se pudo continuar la importación." };
  }
}
