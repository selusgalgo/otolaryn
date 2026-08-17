import type { Role } from "@/lib/types";

// Single source of truth — was previously duplicated (and drifting: "Admin"
// vs "Administrador") between the /users list and the user creation form.
export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Superadmin",
  admin: "Administrador",
  profesional: "Profesional",
  recepcion: "Recepción",
};
