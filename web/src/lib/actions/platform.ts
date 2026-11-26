"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { apiFetch, apiFetchMultipart, ApiError } from "@/lib/api";
import type {
  AppointmentDefaultsFormState,
  ClinicProfileFormState,
  ScheduleFormState,
} from "@/lib/actions/settings";
import type { UserFormState } from "@/lib/actions/users";
import { scheduleFromFormData } from "@/lib/schedule";
import type {
  AppUser,
  ClinicProfile,
  CreditorProfile,
  SepaMandate,
  Tenant,
  TenantAppointmentDefaults,
  TenantSchedule,
} from "@/lib/types";

export interface TenantFormState {
  error?: string;
  success?: boolean;
}

export async function updateTenantWhatsappPlatformAction(
  tenantId: string,
  _prev: TenantFormState,
  formData: FormData,
): Promise<TenantFormState> {
  try {
    await apiFetch(`/platform/tenants/${tenantId}/whatsapp-booking`, {
      method: "PATCH",
      body: { platformEnabled: formData.get("platformEnabled") === "on" },
    });
  } catch (err) {
    return {
      error:
        err instanceof ApiError
          ? err.message
          : "No se pudo guardar la habilitación.",
    };
  }
  revalidatePath(`/platform/${tenantId}/settings`);
  return { success: true };
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

// superadmin, any clinic — plantilla (punto de partida) y campos marcados que
// usa esa clínica en sus consultas (see
// lib/consultation-template.ts). Never touches any existing consulta's data.
export async function updateTenantConsultationTemplateAction(
  tenantId: string,
  _prev: TenantFormState,
  formData: FormData,
): Promise<TenantFormState> {
  try {
    await apiFetch(`/platform/tenants/${tenantId}/consultation-template`, {
      method: "PATCH",
      body: {
        template: String(formData.get("template") ?? ""),
        // Casillas marcadas: los campos que usará la clínica.
        fields: formData.getAll("fields").map(String),
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo guardar la plantilla de consulta." };
  }

  revalidatePath(`/platform/${tenantId}/settings`);
  return { success: true };
}

// superadmin, any clinic — same binding shape as updateTenantScheduleAction.
export async function updateTenantAppointmentDefaultsAction(
  tenantId: string,
  _prevState: AppointmentDefaultsFormState,
  formData: FormData,
): Promise<AppointmentDefaultsFormState> {
  const defaultDurationMinutes = Number(formData.get("defaultDurationMinutes"));

  try {
    await apiFetch<TenantAppointmentDefaults>(
      `/platform/tenants/${tenantId}/appointment-defaults`,
      { method: "PATCH", body: { defaultDurationMinutes } },
    );
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo guardar la duración por defecto." };
  }

  revalidatePath(`/platform/${tenantId}/settings`);
  return { success: true };
}

// superadmin, any clinic — same binding shape as updateTenantScheduleAction,
// multipart for the same reason as updateClinicProfileAction (settings.ts).
export async function updateTenantClinicProfileAction(
  tenantId: string,
  _prevState: ClinicProfileFormState,
  formData: FormData,
): Promise<ClinicProfileFormState> {
  try {
    await apiFetchMultipart<ClinicProfile>(
      `/platform/tenants/${tenantId}/clinic-profile`,
      formData,
      "PATCH",
    );
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo guardar el perfil de la clínica." };
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
        staffFunction: String(formData.get("staffFunction") ?? ""),
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
        staffFunction: String(formData.get("staffFunction") ?? ""),
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

// ---- Domiciliación SEPA (Panel Eiduo) ----

export interface SepaFormState {
  error?: string;
  success?: boolean;
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

// Decimal comma or point — "49,90" and "49.90" are the same fee.
function decimal(formData: FormData, name: string): number {
  return Number(text(formData, name).replace(",", "."));
}

export async function updateCreditorProfileAction(
  _prevState: SepaFormState,
  formData: FormData,
): Promise<SepaFormState> {
  try {
    await apiFetch<CreditorProfile>("/platform/creditor-profile", {
      method: "PUT",
      body: {
        name: text(formData, "name"),
        taxId: text(formData, "taxId"),
        address: text(formData, "address"),
        postalCode: text(formData, "postalCode"),
        city: text(formData, "city"),
        province: text(formData, "province"),
        country: text(formData, "country"),
        email: text(formData, "email"),
        phone: text(formData, "phone"),
        website: text(formData, "website"),
        sepaCreditorId: text(formData, "sepaCreditorId"),
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudieron guardar los datos de facturación." };
  }

  revalidatePath("/platform/billing");
  return { success: true };
}

// superadmin, any clinic — tenantId bound by the clinic's own SEPA page.
export async function saveSepaMandateAction(
  tenantId: string,
  _prevState: SepaFormState,
  formData: FormData,
): Promise<SepaFormState> {
  try {
    await apiFetch<SepaMandate>(`/platform/tenants/${tenantId}/sepa-mandate`, {
      method: "PUT",
      body: {
        holderName: text(formData, "holderName"),
        holderTaxId: text(formData, "holderTaxId"),
        clinicName: text(formData, "clinicName"),
        signerName: text(formData, "signerName"),
        signerPosition: text(formData, "signerPosition"),
        address: text(formData, "address"),
        postalCode: text(formData, "postalCode"),
        city: text(formData, "city"),
        province: text(formData, "province"),
        country: text(formData, "country"),
        email: text(formData, "email"),
        phone: text(formData, "phone"),
        iban: text(formData, "iban"),
        bic: text(formData, "bic"),
        planName: text(formData, "planName"),
        monthlyBase: decimal(formData, "monthlyBase"),
        vatPercent: decimal(formData, "vatPercent"),
        irpfPercent: decimal(formData, "irpfPercent"),
        firstChargeDate: text(formData, "firstChargeDate"),
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo guardar la orden SEPA." };
  }

  revalidatePath(`/platform/${tenantId}`);
  revalidatePath(`/platform/${tenantId}/sepa`);
  return { success: true };
}

export interface SigningLinkResult {
  error?: string;
  url?: string;
  expiresAt?: string;
}

// The public origin the clinic owner will open the link on — taken from the
// request the superadmin is making (the reverse proxy's forwarded host), so
// it's right in production and in local dev without another env var.
async function publicOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// Issuing a link revokes the previous one (the API keeps a single active
// token per mandate), and the token only ever exists in this response — it
// is stored hashed — so the panel shows the URL right away.
export async function issueSepaSigningLinkAction(
  tenantId: string,
): Promise<SigningLinkResult> {
  try {
    const { token, expiresAt } = await apiFetch<{
      token: string;
      expiresAt: string;
    }>(`/platform/tenants/${tenantId}/sepa-mandate/signing-link`, {
      method: "POST",
    });
    revalidatePath(`/platform/${tenantId}/sepa`);
    return { url: `${await publicOrigin()}/sepa/${token}`, expiresAt };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo generar el enlace." };
  }
}

export async function cancelSepaMandateAction(
  tenantId: string,
): Promise<SepaFormState> {
  try {
    await apiFetch<SepaMandate>(
      `/platform/tenants/${tenantId}/sepa-mandate/cancel`,
      { method: "POST" },
    );
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo cancelar la orden." };
  }

  revalidatePath(`/platform/${tenantId}`);
  revalidatePath(`/platform/${tenantId}/sepa`);
  return { success: true };
}
