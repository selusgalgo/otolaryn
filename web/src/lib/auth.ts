import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import type { Me } from "@/lib/types";

// cache() dedupes calls within a single request/render pass — several
// Server Components in the same tree (layout, page, nested sections) can
// each call this without triggering redundant round-trips to /auth/me.
//
// Un 401 aquí significa que la API no acepta la sesión aunque la cookie
// siga presente (JWT caducado, dispositivo bloqueado, cuenta desactivada).
// Dejarlo propagar tumbaba toda la app con "Application error" y, como la
// cookie seguía ahí, /login rebotaba otra vez al dashboard. En su lugar se
// pasa por /session/expired, que borra la cookie y lleva a /login con el
// motivo y la ruta a la que volver.
export const getCurrentUser = cache(async (): Promise<Me> => {
  try {
    return await apiFetch<Me>("/auth/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const params = new URLSearchParams({ reason: err.code ?? "SESSION_EXPIRED" });
      const path = (await headers()).get("x-pathname");
      if (path && path !== "/") params.set("redirect", path);
      redirect(`/session/expired?${params.toString()}`);
    }
    throw err;
  }
});

// Where each role lands right after login / at the bare "/" route.
// superadmin never enters the clinic app at all.
export function homeForRole(role: Me["role"]): string {
  return role === "superadmin" ? "/platform" : "/dashboard";
}
