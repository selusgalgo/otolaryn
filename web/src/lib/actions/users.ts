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
