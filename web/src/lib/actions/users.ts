"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api";
import type { AppUser } from "@/lib/types";

export interface UserFormState {
  error?: string;
  success?: boolean;
}

export async function createUserAction(
  _prevState: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  try {
    await apiFetch<AppUser>("/users", {
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

  revalidatePath("/users");
  return { success: true };
}

// Admin editing a user in their own tenant — see EditUserDialog. Username
// empty string clears it, same convention as the account profile form.
export async function updateUserAction(
  userId: string,
  _prevState: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  try {
    await apiFetch<AppUser>(`/users/${userId}`, {
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

  revalidatePath("/users");
  return { success: true };
}

// No current-password check here on purpose — this is admin/superadmin
// setting someone else's password directly (e.g. because they're locked
// out), not the account holder changing their own (that's
// account.ts's updatePasswordAction, which does verify the current one).
export async function resetUserPasswordAction(
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
    await apiFetch(`/users/${userId}/password`, {
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
