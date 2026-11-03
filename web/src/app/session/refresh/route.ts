import { NextResponse } from "next/server";
import { ApiError, apiFetch } from "@/lib/api";
import { decodeJwtClaims } from "@/lib/jwt";
import { setSessionToken } from "@/lib/session";

// Renueva el JWT de la sesión en curso (sesión deslizante) y reescribe la
// cookie. Lo llama SessionKeepAlive cuando la persona está activa y al token
// le queda poco. Es un Route Handler y no un Server Component porque solo
// Route Handlers, Server Actions y el middleware pueden escribir cookies.
// La API rechaza con 401 si la cuenta/dispositivo ya no valen o si se agotó
// el techo absoluto de la sesión (session_end).
export async function POST(): Promise<Response> {
  try {
    const { accessToken } = await apiFetch<{ accessToken: string }>("/auth/refresh", { method: "POST" });
    await setSessionToken(accessToken);
    const claims = decodeJwtClaims(accessToken);
    return NextResponse.json({
      expiresAt: claims?.exp ? claims.exp * 1000 : null,
      sessionEndsAt: claims?.session_end ? claims.session_end * 1000 : null,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return NextResponse.json({ error: err.code ?? "SESSION_EXPIRED" }, { status: 401 });
    }
    return NextResponse.json({ error: "REFRESH_FAILED" }, { status: 502 });
  }
}
