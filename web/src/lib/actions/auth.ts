"use server";

import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { homeForRole } from "@/lib/auth";
import { clearSessionToken, getDeviceToken, setSessionToken } from "@/lib/session";
import type { Me } from "@/lib/types";

export interface LoginState {
  error?: string;
}

interface LoginResponse {
  accessToken: string;
}

// Solo rutas internas relativas ("/patients/123/..."), nunca lo que venga
// en ?redirect= tal cual — si no, un enlace de login manipulado podría
// mandar a alguien fuera de la app tras autenticarse (open redirect).
// "//evil.com" parece relativo pero el navegador lo trata como absoluto,
// de ahí el chequeo explícito además del "empieza por /".
function safeRedirectTarget(raw: FormDataEntryValue | null): string | null {
  const value = typeof raw === "string" ? raw : "";
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("://")) {
    return value;
  }
  return null;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  // Email or username — the backend checks both columns (AuthService.login).
  const identifier = String(formData.get("identifier") ?? "");
  const password = String(formData.get("password") ?? "");
  // Lo rellena un <input type="hidden"> cuando se llega aquí desde un
  // aviso de "tu sesión ha caducado" en medio de algo (p.ej. una consulta
  // a medio escribir) — así, al volver a entrar, se aterriza otra vez
  // justo ahí en vez de en /dashboard. Ver ClinicalEntryForm.
  const redirectTarget = safeRedirectTarget(formData.get("redirect"));

  let destination = redirectTarget ?? "/dashboard";
  try {
    const deviceToken = await getDeviceToken();
    const { accessToken } = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: { identifier, password, ...(deviceToken ? { deviceToken } : {}) },
      skipAuth: true,
    });
    await setSessionToken(accessToken);
    // Superadmin never enters the clinic app — route it straight to the
    // platform screens instead of bouncing through /dashboard first. A
    // redirectTarget overrides this too: the one case it doesn't make
    // sense is superadmin (who has no patient-facing pages to return to),
    // but that's already structurally impossible to reach from a
    // clinical-entry redirect.
    if (!redirectTarget) {
      const me = await apiFetch<Me>("/auth/me");
      destination = homeForRole(me.role);
    }
  } catch (err) {
    if (err instanceof ApiError) {
      // A 401 normally collapses to this generic message on purpose (same
      // anti-enumeration intent as AuthService's dummy-hash check — it
      // shouldn't be possible to tell "wrong password" apart from
      // "deactivated account" from the response). The device-lock message
      // is the one deliberate exception: it's shown verbatim because the
      // password was actually correct, and the user needs to know to
      // contact the admin about this specific computer, not retype it.
      const isDeviceLocked = err.message.startsWith("Este dispositivo no está autorizado");
      return {
        error:
          err.status === 401 && !isDeviceLocked
            ? "Email/usuario o contraseña incorrectos."
            : err.message,
      };
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
