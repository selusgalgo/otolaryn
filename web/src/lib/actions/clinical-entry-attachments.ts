"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, apiFetchMultipart, ApiError, isSessionEnded } from "@/lib/api";
import type { ClinicalEntryAttachment } from "@/lib/types";

export interface AttachmentActionResult {
  error?: string;
  attachment?: ClinicalEntryAttachment;
}

function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 401 && (isSessionEnded(err) || err.code === undefined)) {
      return "Tu sesión ha caducado. Vuelve a iniciar sesión.";
    }
    if (err.status === 413) return "El archivo pesa más de 10 MB.";
    return err.message;
  }
  return fallback;
}

export async function listAttachmentsAction(
  entryId: string,
): Promise<{ error?: string; attachments?: ClinicalEntryAttachment[] }> {
  try {
    const attachments = await apiFetch<ClinicalEntryAttachment[]>(`/clinical-entries/${entryId}/attachments`);
    return { attachments };
  } catch (err) {
    return { error: errorText(err, "No se pudieron cargar los archivos.") };
  }
}

export async function uploadAttachmentAction(
  patientId: string,
  entryId: string,
  formData: FormData,
): Promise<AttachmentActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona un archivo." };
  const upstream = new FormData();
  upstream.set("file", file, file.name);
  try {
    const attachment = await apiFetchMultipart<ClinicalEntryAttachment>(
      `/clinical-entries/${entryId}/attachments`,
      upstream,
    );
    revalidatePath(`/patients/${patientId}`);
    revalidatePath(`/patients/${patientId}/clinical-entries/${entryId}`);
    return { attachment };
  } catch (err) {
    return { error: errorText(err, "No se pudo subir el archivo.") };
  }
}

export async function deleteAttachmentAction(
  patientId: string,
  entryId: string,
  attachmentId: string,
): Promise<{ error?: string }> {
  try {
    await apiFetch(`/clinical-entry-attachments/${attachmentId}`, { method: "DELETE" });
  } catch (err) {
    return { error: errorText(err, "No se pudo quitar el archivo.") };
  }
  revalidatePath(`/patients/${patientId}`);
  revalidatePath(`/patients/${patientId}/clinical-entries/${entryId}`);
  return {};
}
