import type { Role, StaffFunction } from "@/lib/types";

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

// Only offered when the form's role is "admin" — an owner who also sees
// patients or also staffs the front desk, on top of full admin access.
// Labelled "Doctor" here rather than reusing ROLE_LABELS.profesional
// ("Profesional") since this picker is about the clinical duty itself, not
// the access-level role named "profesional".
export const STAFF_FUNCTION_LABELS: Record<StaffFunction, string> = {
  profesional: "Doctor",
  recepcion: "Recepción",
};

export const STAFF_FUNCTIONS: StaffFunction[] = ["profesional", "recepcion"];
