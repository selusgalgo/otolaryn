"use server";

import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { clearSessionToken, setSessionToken } from "@/lib/session";

export interface LoginState {
  error?: string;
}

interface LoginResponse {
  accessToken: string;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    const { accessToken } = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
      skipAuth: true,
    });
    await setSessionToken(accessToken);
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.status === 401 ? "Email o contraseña incorrectos." : err.message };
    }
    return { error: "No se pudo conectar con el servidor." };
  }

  // Outside the try/catch on purpose: redirect() throws internally to hand
  // control back to Next's router, and catching that here would turn a
  // successful login into a false "error" state.
  redirect("/patients");
}

export async function logoutAction(): Promise<void> {
  await clearSessionToken();
  redirect("/login");
}
