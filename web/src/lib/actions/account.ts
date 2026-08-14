"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api";
import type { AccountProfile } from "@/lib/types";

export interface ProfileFormState {
  error?: string;
  success?: boolean;
}

export async function updateProfileAction(
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  try {
    await apiFetch<AccountProfile>("/account/profile", {
      method: "PATCH",
      body: {
        firstName: String(formData.get("firstName") ?? "").trim(),
        lastName: String(formData.get("lastName") ?? "").trim(),
        // Sent even when empty — an empty string tells the backend to
        // clear the username, not "leave it unset" (see AccountService).
        username: String(formData.get("username") ?? "").trim(),
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudieron guardar los cambios." };
  }

  revalidatePath("/account");
  return { success: true };
}

export interface PasswordFormState {
  error?: string;
  success?: boolean;
}

export async function updatePasswordAction(
  _prevState: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword !== confirmPassword) {
    return { error: "Las contraseñas nuevas no coinciden." };
  }

  try {
    await apiFetch("/account/password", {
      method: "PATCH",
      body: {
        currentPassword: String(formData.get("currentPassword") ?? ""),
        newPassword,
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.status === 401 ? "La contraseña actual no es correcta." : err.message };
    }
    return { error: "No se pudo cambiar la contraseña." };
  }

  return { success: true };
}
