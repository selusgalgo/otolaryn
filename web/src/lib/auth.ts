import { cache } from "react";
import { apiFetch } from "@/lib/api";
import type { Me } from "@/lib/types";

// cache() dedupes calls within a single request/render pass — several
// Server Components in the same tree (layout, page, nested sections) can
// each call this without triggering redundant round-trips to /auth/me.
export const getCurrentUser = cache(async (): Promise<Me> => {
  return apiFetch<Me>("/auth/me");
});

// Where each role lands right after login / at the bare "/" route.
// superadmin never enters the clinic app at all.
export function homeForRole(role: Me["role"]): string {
  return role === "superadmin" ? "/platform" : "/dashboard";
}
