import { apiFetch } from "@/lib/api";
import {
  ALL_CONSULTATION_FIELDS,
  CONSULTATION_TEMPLATES,
  DEFAULT_CONSULTATION_TEMPLATE,
  TEMPLATE_DEFINITIONS,
  type ConsultationField,
  type ConsultationTemplate,
} from "@/lib/consultation-template";

// Server-only (apiFetch reads the session cookie) — kept out of
// lib/consultation-template.ts, which the client-side consulta form imports.
//
// Falls back to the default template if the request fails: the consulta
// pages must still render (the default shows the original five fields, and
// visibleFields() still shows any other field that already has data).
export async function getClinicConsultationTemplate(): Promise<ConsultationTemplate> {
  try {
    const { template } = await apiFetch<{ template: string }>(
      "/settings/consultation-template",
    );
    return (CONSULTATION_TEMPLATES as readonly string[]).includes(template)
      ? (template as ConsultationTemplate)
      : DEFAULT_CONSULTATION_TEMPLATE;
  } catch {
    return DEFAULT_CONSULTATION_TEMPLATE;
  }
}

// Plantilla y campos efectivos de la clínica (los marcados por superadmin o,
// sin marcar, los de la plantilla). Mismo fallback que arriba si falla.
export async function getClinicConsultationConfig(): Promise<{
  template: ConsultationTemplate;
  fields: ConsultationField[];
}> {
  try {
    const { template, fields } = await apiFetch<{
      template: string;
      fields?: string[];
    }>("/settings/consultation-template");
    const valid = (CONSULTATION_TEMPLATES as readonly string[]).includes(
      template,
    )
      ? (template as ConsultationTemplate)
      : DEFAULT_CONSULTATION_TEMPLATE;
    const known = (fields ?? []).filter((f): f is ConsultationField =>
      (ALL_CONSULTATION_FIELDS as string[]).includes(f),
    );
    return {
      template: valid,
      fields: known.length > 0 ? known : TEMPLATE_DEFINITIONS[valid].fields,
    };
  } catch {
    return {
      template: DEFAULT_CONSULTATION_TEMPLATE,
      fields: TEMPLATE_DEFINITIONS[DEFAULT_CONSULTATION_TEMPLATE].fields,
    };
  }
}
