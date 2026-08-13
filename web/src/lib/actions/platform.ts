"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api";
import type { Tenant } from "@/lib/types";

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
