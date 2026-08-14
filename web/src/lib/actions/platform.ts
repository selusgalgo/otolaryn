"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api";
import type { ScheduleFormState } from "@/lib/actions/settings";
import { scheduleFromFormData } from "@/lib/schedule";
import type { Tenant, TenantSchedule } from "@/lib/types";

export interface TenantFormState {
  error?: string;
  success?: boolean;
}

export async function createTenantAction(
  _prevState: TenantFormState,
  formData: FormData,
): Promise<TenantFormState> {
  try {
    await apiFetch<Tenant>("/platform/tenants", {
      method: "POST",
      body: {
        name: String(formData.get("name") ?? "").trim(),
        adminEmail: String(formData.get("adminEmail") ?? "").trim(),
        adminFirstName: String(formData.get("adminFirstName") ?? "").trim(),
        adminLastName: String(formData.get("adminLastName") ?? "").trim(),
        adminPassword: String(formData.get("adminPassword") ?? ""),
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo crear la clínica." };
  }

  revalidatePath("/platform");
  return { success: true };
}

// superadmin, any clinic — tenantId is bound by the caller (the page for
// that specific clinic), same pattern as createAppointmentAction(patientId, ...).
export async function updateTenantScheduleAction(
  tenantId: string,
  _prevState: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  try {
    await apiFetch<TenantSchedule>(`/platform/tenants/${tenantId}/schedule`, {
      method: "PATCH",
      body: { days: scheduleFromFormData(formData) },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo guardar el horario." };
  }

  revalidatePath(`/platform/${tenantId}/settings`);
  return { success: true };
}
