import { apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import type { AppUser } from "@/lib/types";

export interface PractitionerOption {
  id: string;
  label: string;
}

// null means "don't show a practitioner picker at all" — a profesional's
// own appointments are auto-assigned to them server-side, so there's
// nothing to choose. A non-null array (possibly empty, if no profesionales
// exist yet) means admin/recepcion must pick one explicitly — GET
// /users?role=profesional would 403 for any other role anyway.
export async function getPractitionerOptions(): Promise<PractitionerOption[] | null> {
  const me = await getCurrentUser();
  if (me.role !== "admin" && me.role !== "recepcion") {
    return null;
  }
  const profesionales = await apiFetch<AppUser[]>("/users?role=profesional");
  return profesionales.map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName}` }));
}
