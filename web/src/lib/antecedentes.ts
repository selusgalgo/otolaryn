import { apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import type { AntecedenteType } from "@/lib/types";

// null means "don't offer antecedentes at all" — recepcion has no access
// to clinical data (antecedente_types included), same exclusion already
// applied to clinical entries throughout the app. Only active types: a
// deactivated antecedente shouldn't be offered for new use, whether as an
// import-mapping target or a checklist item — it stays visible on a
// patient that already has it marked (see PatientAntecedentesCard), but
// that's a different, narrower concern than this list.
export async function getActiveAntecedenteTypes(): Promise<AntecedenteType[] | null> {
  const me = await getCurrentUser();
  if (me.role === "recepcion") return null;
  const types = await apiFetch<AntecedenteType[]>("/antecedente-types");
  return types.filter((t) => t.active);
}
