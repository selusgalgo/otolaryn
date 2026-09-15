import { apiFetch } from "@/lib/api";
import type { InsuranceEntity } from "@/lib/types";

export interface InsuranceOption {
  id: string;
  label: string;
}

// Read access is open to every tenant role (admin/profesional/recepcion),
// unlike getPractitionerOptions — there's no "own agenda" equivalent
// restriction for a plain catalog lookup like this one.
export async function getInsuranceOptions(): Promise<InsuranceOption[]> {
  const entities = await apiFetch<InsuranceEntity[]>("/insurance-entities");
  return entities
    .map((e) => ({ id: e.id, label: e.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}
