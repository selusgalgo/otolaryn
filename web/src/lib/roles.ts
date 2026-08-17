import type { Role } from "@/lib/types";

// Single source of truth — was previously duplicated (and drifting: "Admin"
// vs "Administrador") between the /users list and the user creation form.
export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Superadmin",
  admin: "Administrador",
  profesional: "Profesional",
  recepcion: "Recepción",
};

// superadmin excluded on purpose — never assignable through a tenant-scoped
// (or superadmin-on-behalf-of-a-tenant) user form, only via seeding.
export const ASSIGNABLE_ROLES: Role[] = ["admin", "profesional", "recepcion"];
