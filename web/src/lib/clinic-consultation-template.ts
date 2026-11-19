import { apiFetch } from "@/lib/api";
import {
  CONSULTATION_TEMPLATES,
  DEFAULT_CONSULTATION_TEMPLATE,
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
    const { template } = await apiFetch<{ template: string }>("/settings/consultation-template");
    return (CONSULTATION_TEMPLATES as readonly string[]).includes(template)
      ? (template as ConsultationTemplate)
      : DEFAULT_CONSULTATION_TEMPLATE;
  } catch {
    return DEFAULT_CONSULTATION_TEMPLATE;
  }
}
