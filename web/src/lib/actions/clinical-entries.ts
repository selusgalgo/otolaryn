"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch, ApiError, isSessionEnded } from "@/lib/api";
import type { ClinicalEntry } from "@/lib/types";

export interface ClinicalEntryFormState {
  error?: string;
  // Solo lo usa el modo edición (ClinicalEntryForm's onSuccess) — crear
  // redirige en vez de devolver success, así que nunca lo necesita.
  success?: boolean;
  // Distingue "la sesión caducó mientras escribías" de cualquier otro
  // fallo (validación, red, etc.) — el formulario usa esto para mostrar
  // un aviso específico con un botón directo a volver a iniciar sesión,
  // en vez del error genérico de abajo. Ver ClinicalEntryForm.
  sessionExpired?: boolean;
  // Solo en el alta: a dónde ir tras crear la consulta. Antes la acción hacía
  // redirect() y el formulario nunca llegaba a saber que el guardado había
  // ido bien, así que el borrador autoguardado se quedaba y reaparecía en la
  // siguiente consulta del paciente. Ahora navega el cliente, tras borrarlo.
  redirectTo?: string;
}

// Un 401 del backend aquí nunca es "contraseña incorrecta" (eso solo pasa en
// /auth/login), pero tampoco es siempre "la sesión caducó": la API distingue
// con `code` el JWT caducado de un dispositivo bloqueado o una cuenta
// desactivada, donde volver a entrar no arregla nada. Sin `code` (una API
// anterior a esa distinción) se sigue tratando como sesión caducada.
// Centralizado porque las dos acciones de abajo necesitan el mismo trato.
function clinicalEntryErrorState(err: unknown): ClinicalEntryFormState {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      if (isSessionEnded(err) || err.code === undefined) {
        return { error: "Tu sesión ha caducado.", sessionExpired: true };
      }
      if (err.code === "ACCOUNT_DISABLED") {
        return { error: "Tu cuenta está desactivada. Contacta con el administrador de la clínica." };
      }
      return { error: err.message };
    }
    return { error: err.message };
  }
  return { error: "No se pudo guardar." };
}

// Cuerpo de alta de una consulta a partir del formulario: los campos vacíos se
// omiten (en el alta "vacío" es "nada que guardar todavía", a diferencia de la
// edición). Lo comparten crear una consulta y firmar un borrador.
function entryBodyFromForm(formData: FormData) {
  const visitDate = String(formData.get("visitDate") ?? "").trim();
  const examinationFindings = String(formData.get("examinationFindings") ?? "").trim();
  const diagnosis = String(formData.get("diagnosis") ?? "").trim();
  const treatment = String(formData.get("treatment") ?? "").trim();
  const followUpNotes = String(formData.get("followUpNotes") ?? "").trim();

  return {
    chiefComplaint: String(formData.get("chiefComplaint") ?? "").trim(),
    ...(visitDate ? { visitDate: new Date(visitDate).toISOString() } : {}),
    ...(examinationFindings ? { examinationFindings } : {}),
    ...(diagnosis ? { diagnosis } : {}),
    ...(treatment ? { treatment } : {}),
    ...(followUpNotes ? { followUpNotes } : {}),
  };
}

export async function createClinicalEntryAction(
  patientId: string,
  _prevState: ClinicalEntryFormState,
  formData: FormData,
): Promise<ClinicalEntryFormState> {
  const body = entryBodyFromForm(formData);

  let entry: ClinicalEntry;
  try {
    entry = await apiFetch<ClinicalEntry>(`/patients/${patientId}/clinical-entries`, {
      method: "POST",
      body,
    });
  } catch (err) {
    return clinicalEntryErrorState(err);
  }

  revalidatePath(`/patients/${patientId}`);
  return { success: true, redirectTo: `/patients/${patientId}/clinical-entries/${entry.id}` };
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
    return clinicalEntryErrorState(err);
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

// ---- Borradores en el servidor (solo altas) -------------------------------
// Un borrador aparece en la ficha del paciente con la etiqueta "Borrador" para
// seguir desde cualquier ordenador; solo lo ven su autor y los administradores
// y se borra solo a los 10 días sin tocarlo. Editar una consulta ya firmada no
// usa borradores en el servidor (ver ClinicalEntryForm).

export interface DraftValues {
  visitDate: string;
  chiefComplaint: string;
  examinationFindings: string;
  diagnosis: string;
  treatment: string;
  followUpNotes: string;
}

export interface DraftSaveResult {
  id?: string;
  savedAt?: string;
  error?: string;
  // La sesión caducó mientras se autoguardaba: el borrador local sigue siendo
  // la red de seguridad (ver ClinicalEntryForm).
  sessionExpired?: boolean;
}

// Crea el borrador la primera vez (draftId null) y lo actualiza después. Se
// llama desde el autoguardado del formulario, no desde un <form>, así que
// devuelve el resultado en vez de redirigir y no revalida la página: la ficha
// del paciente es dinámica y se vuelve a pedir al navegar a ella.
export async function saveClinicalEntryDraftAction(
  patientId: string,
  draftId: string | null,
  values: DraftValues,
): Promise<DraftSaveResult> {
  const body = {
    ...(values.visitDate ? { visitDate: new Date(values.visitDate).toISOString() } : {}),
    chiefComplaint: values.chiefComplaint,
    examinationFindings: values.examinationFindings,
    diagnosis: values.diagnosis,
    treatment: values.treatment,
    followUpNotes: values.followUpNotes,
  };
  try {
    const draft = draftId
      ? await apiFetch<ClinicalEntry>(`/clinical-entry-drafts/${draftId}`, { method: "PATCH", body })
      : await apiFetch<ClinicalEntry>(`/patients/${patientId}/clinical-entry-drafts`, {
          method: "POST",
          body,
        });
    return { id: draft.id, savedAt: new Date().toISOString() };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401 && (isSessionEnded(err) || err.code === undefined)) {
        return { error: "Tu sesión ha caducado.", sessionExpired: true };
      }
      if (err.status === 404) {
        return { error: "Este borrador ya no existe (caducó o se descartó)." };
      }
      return { error: err.message };
    }
    return { error: "No se pudo guardar el borrador." };
  }
}

// Firma el borrador: pasa a ser una consulta de la historia clínica con los
// valores del formulario (aquí sí se exige el motivo de consulta).
export async function finalizeClinicalEntryDraftAction(
  patientId: string,
  draftId: string,
  _prevState: ClinicalEntryFormState,
  formData: FormData,
): Promise<ClinicalEntryFormState> {
  try {
    await apiFetch<ClinicalEntry>(`/clinical-entry-drafts/${draftId}/finalize`, {
      method: "POST",
      body: entryBodyFromForm(formData),
    });
  } catch (err) {
    return clinicalEntryErrorState(err);
  }

  revalidatePath(`/patients/${patientId}`);
  return { success: true, redirectTo: `/patients/${patientId}/clinical-entries/${draftId}` };
}

// Borrado real del borrador (no es historia clínica). Lo pueden hacer su autor
// y un administrador.
export async function discardClinicalEntryDraftAction(
  patientId: string,
  draftId: string,
): Promise<{ error?: string }> {
  try {
    await apiFetch(`/clinical-entry-drafts/${draftId}`, { method: "DELETE" });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "No se pudo descartar el borrador." };
  }
  revalidatePath(`/patients/${patientId}`);
  return {};
}
