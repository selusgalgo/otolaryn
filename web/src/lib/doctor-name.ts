import { practicesMedicine } from "@/lib/roles";
import type { Honorific, Role, StaffFunction } from "@/lib/types";

// Para no escribir "Dr. Dr. Ana" si alguien ya tecleó el título en el nombre.
const ALREADY_TITLED = /^\s*dra?\.?\s/i;

// Antepone "Dr." o "Dra." al nombre de un profesional médico. Sin tratamiento
// guardado (API anterior, dato que falta) se usa "Dr.", como hasta ahora.
export function withHonorific(name: string, honorific?: Honorific | null): string {
  const clean = name.trim();
  if (ALREADY_TITLED.test(clean)) return clean;
  return `${honorific ?? "Dr."} ${clean}`;
}

interface NamedStaff {
  firstName: string;
  lastName: string;
  role: Role;
  staffFunction?: StaffFunction | null;
  honorific?: Honorific | null;
}

// Nombre para mostrar de cualquier usuario del personal: con "Dr."/"Dra." si
// ejerce como médico (rol Profesional, o administrador con la función
// "Doctor"), tal cual si no (administración, recepción).
export function userDisplayName(user: NamedStaff): string {
  const name = `${user.firstName} ${user.lastName}`;
  return practicesMedicine(user.role, user.staffFunction) ? withHonorific(name, user.honorific) : name;
}

export function isDoctor(user: Pick<NamedStaff, "role" | "staffFunction">): boolean {
  return practicesMedicine(user.role, user.staffFunction);
}
