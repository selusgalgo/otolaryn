"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api";
import { scheduleFromFormData } from "@/lib/schedule";
import type { AntecedenteType, InsuranceEntity, Schedule } from "@/lib/types";

export interface ScheduleFormState {
  error?: string;
  success?: boolean;
}

// admin, own clinic.
export async function updateScheduleAction(
  _prevState: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  try {
    await apiFetch<Schedule>("/settings/schedule", {
      method: "PATCH",
      body: { days: scheduleFromFormData(formData) },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo guardar el horario." };
  }

  revalidatePath("/settings");
  return { success: true };
}

export interface CatalogActionState {
  error?: string;
}

// Called imperatively from AntecedenteTypesForm (a client component), not
// bound to a <form> — each row's own add/rename/toggle/delete is its own
// small mutation, not one big submit like ScheduleForm's whole week.
export async function createAntecedenteTypeAction(
  name: string,
): Promise<{ error?: string; type?: AntecedenteType }> {
  try {
    const type = await apiFetch<AntecedenteType>("/antecedente-types", {
      method: "POST",
      body: { name },
    });
    revalidatePath("/settings");
    return { type };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "No se pudo crear el antecedente." };
  }
}

export async function updateAntecedenteTypeAction(
  id: string,
  patch: { name?: string; active?: boolean; displayOrder?: number },
): Promise<CatalogActionState> {
  try {
    await apiFetch<AntecedenteType>(`/antecedente-types/${id}`, {
      method: "PATCH",
      body: patch,
    });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "No se pudo actualizar el antecedente." };
  }
  revalidatePath("/settings");
  return {};
}

// A 409 here means the type is already marked on some patient — surfaced
// as-is (the backend's own message already says to desactivar instead),
// not swallowed into a generic error.
export async function deleteAntecedenteTypeAction(
  id: string,
): Promise<CatalogActionState> {
  try {
    await apiFetch(`/antecedente-types/${id}`, { method: "DELETE" });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "No se pudo eliminar el antecedente." };
  }
  revalidatePath("/settings");
  return {};
}

export async function createInsuranceEntityAction(
  name: string,
): Promise<{ error?: string; entity?: InsuranceEntity }> {
  try {
    const entity = await apiFetch<InsuranceEntity>("/insurance-entities", {
      method: "POST",
      body: { name },
    });
    revalidatePath("/settings");
    return { entity };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "No se pudo crear la aseguradora." };
  }
}

export async function updateInsuranceEntityAction(
  id: string,
  name: string,
): Promise<CatalogActionState> {
  try {
    await apiFetch<InsuranceEntity>(`/insurance-entities/${id}`, {
      method: "PATCH",
      body: { name },
    });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "No se pudo renombrar la aseguradora." };
  }
  revalidatePath("/settings");
  return {};
}

export async function deleteInsuranceEntityAction(
  id: string,
): Promise<CatalogActionState> {
  try {
    await apiFetch(`/insurance-entities/${id}`, { method: "DELETE" });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "No se pudo eliminar la aseguradora." };
  }
  revalidatePath("/settings");
  return {};
}
