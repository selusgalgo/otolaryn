"use server";

import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { homeForRole } from "@/lib/auth";
import { clearSessionToken, setSessionToken } from "@/lib/session";
import type { Me } from "@/lib/types";

export interface LoginState {
  error?: string;
}

interface LoginResponse {
  accessToken: string;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  // Email or username — the backend checks both columns (AuthService.login).
  const identifier = String(formData.get("identifier") ?? "");
  const password = String(formData.get("password") ?? "");

  let destination = "/dashboard";
  try {
    const { accessToken } = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: { identifier, password },
      skipAuth: true,
    });
    await setSessionToken(accessToken);
    // Superadmin never enters the clinic app — route it straight to the
    // platform screens instead of bouncing through /dashboard first.
    const me = await apiFetch<Me>("/auth/me");
    destination = homeForRole(me.role);
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.status === 401 ? "Email/usuario o contraseña incorrectos." : err.message };
    }
    return { error: "No se pudo conectar con el servidor." };
  }

  // Outside the try/catch on purpose: redirect() throws internally to hand
  // control back to Next's router, and catching that here would turn a
  // successful login into a false "error" state.
  redirect(destination);
}

export async function logoutAction(): Promise<void> {
  await clearSessionToken();
  redirect("/login");
}
