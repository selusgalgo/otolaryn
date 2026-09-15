"use server";

import { revalidatePath } from "next/cache";
import { apiFetchMultipart, ApiError } from "@/lib/api";

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

export interface ImportClinicalEntriesResult {
  totalRows: number;
  created: number;
  skipped: { row: number; reason: string }[];
}

export interface ImportClinicalEntriesState {
  error?: string;
  result?: ImportClinicalEntriesResult;
}

// Step 3: the actual import — mapping (column->field) and doctorMapping
// (file's own doctor name -> chosen user id) both confirmed in the
// wizard. Reports through `result` even on success, same as
// importPatientsAction: a partial import (rows skipped for a missing
// paciente/médico) is the expected common case here, not an error.
export async function importClinicalEntriesAction(
  file: File,
  mapping: ClinicalEntryColumnMapping,
  doctorMapping: Record<string, string>,
): Promise<ImportClinicalEntriesState> {
  const upstream = new FormData();
  upstream.set("file", file, file.name);
  upstream.set("mapping", JSON.stringify(mapping));
  upstream.set("doctorMapping", JSON.stringify(doctorMapping));
  try {
    const result = await apiFetchMultipart<ImportClinicalEntriesResult>(
      "/clinical-entries/import",
      upstream,
    );
    revalidatePath("/patients");
    return { result };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "No se pudo importar el fichero." };
  }
}
