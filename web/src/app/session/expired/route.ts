import { NextRequest, NextResponse } from "next/server";
import { safeRedirectTarget } from "@/lib/safe-redirect";
import { clearSessionToken } from "@/lib/session";

// Destino cuando la API rechaza una sesión que la cookie aún da por buena
// (dispositivo bloqueado, cuenta desactivada, JWT inválido...). Sin pasar
// por aquí, /login con la cookie presente rebotaría a /dashboard, que
// volvería a fallar. Borra la cookie y lleva a /login conservando a dónde
// volver y el motivo, para que la pantalla de login lo explique.
const KNOWN_REASONS = new Set([
  "SESSION_EXPIRED",
  "TOKEN_INVALID",
  "DEVICE_LOCKED",
  "DEVICE_CREDENTIAL_INVALID",
  "ACCOUNT_DISABLED",
]);

export async function GET(request: NextRequest): Promise<Response> {
  await clearSessionToken();

  const loginUrl = new URL("/login", request.url);
  const reason = request.nextUrl.searchParams.get("reason") ?? "";
  if (KNOWN_REASONS.has(reason)) loginUrl.searchParams.set("reason", reason);
  const redirectTarget = safeRedirectTarget(request.nextUrl.searchParams.get("redirect"));
  if (redirectTarget && redirectTarget !== "/") loginUrl.searchParams.set("redirect", redirectTarget);

  return NextResponse.redirect(loginUrl);
}
