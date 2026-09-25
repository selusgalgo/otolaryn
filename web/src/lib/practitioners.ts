import { apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import type { AppUser } from "@/lib/types";

export interface PractitionerOption {
  id: string;
  label: string;
}

// null means "don't show a practitioner picker at all" — a profesional's
// own appointments are auto-assigned to them server-side, so there's
// nothing to choose. A non-null array (possibly empty, if no one bookable
// exists yet) means admin/recepcion must pick one explicitly — GET
// /users?bookable=true would 403 for any other role anyway. "Bookable"
// means every profesional, plus any admin who also practices (an
// owner-doctor) — see UsersService.findAll.
export async function getPractitionerOptions(): Promise<PractitionerOption[] | null> {
  const me = await getCurrentUser();
  if (me.role !== "admin" && me.role !== "recepcion") {
    return null;
  }
  const bookable = await apiFetch<AppUser[]>("/users?bookable=true");
  return bookable.map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName}` }));
}
