"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api";
import type { ScheduleFormState } from "@/lib/actions/settings";
import type { UserFormState } from "@/lib/actions/users";
import { scheduleFromFormData } from "@/lib/schedule";
import type { AppUser, Tenant, TenantSchedule } from "@/lib/types";

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

// superadmin creating/editing a user in a clinic it doesn't belong to —
// same shape as the tenant-scoped versions in actions/users.ts, just
// bound to a tenantId chosen from /platform instead of the caller's own.
export async function createTenantUserAction(
  tenantId: string,
  _prevState: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  try {
    await apiFetch<AppUser>(`/platform/tenants/${tenantId}/users`, {
      method: "POST",
      body: {
        email: String(formData.get("email") ?? "").trim(),
        firstName: String(formData.get("firstName") ?? "").trim(),
        lastName: String(formData.get("lastName") ?? "").trim(),
        password: String(formData.get("password") ?? ""),
        role: String(formData.get("role") ?? "profesional"),
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo crear el usuario." };
  }

  revalidatePath(`/platform/${tenantId}`);
  return { success: true };
}

export async function updateTenantUserAction(
  tenantId: string,
  userId: string,
  _prevState: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  try {
    await apiFetch<AppUser>(`/platform/tenants/${tenantId}/users/${userId}`, {
      method: "PATCH",
      body: {
        firstName: String(formData.get("firstName") ?? "").trim(),
        lastName: String(formData.get("lastName") ?? "").trim(),
        username: String(formData.get("username") ?? "").trim(),
        role: String(formData.get("role") ?? ""),
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo actualizar el usuario." };
  }

  revalidatePath(`/platform/${tenantId}`);
  return { success: true };
}

export async function resetTenantUserPasswordAction(
  tenantId: string,
  userId: string,
  _prevState: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword !== confirmPassword) {
    return { error: "Las contraseñas no coinciden." };
  }

  try {
    await apiFetch(`/platform/tenants/${tenantId}/users/${userId}/password`, {
      method: "PATCH",
      body: { newPassword },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo restablecer la contraseña." };
  }

  return { success: true };
}
