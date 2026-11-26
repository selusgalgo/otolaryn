// Copia de src/clinical-entries/consultation-template.ts (backend) — mantener
// ambas iguales. Ver allí el porqué de las plantillas.

export const CONSULTATION_TEMPLATES = ["orl", "cirugia"] as const;
export type ConsultationTemplate = (typeof CONSULTATION_TEMPLATES)[number];

export const DEFAULT_CONSULTATION_TEMPLATE: ConsultationTemplate = "orl";

export type ConsultationField =
  | "chiefComplaint"
  | "examinationFindings"
  | "evolution"
  | "diagnosis"
  | "treatment"
  | "report"
  | "followUpNotes"
  | "referringDoctor";

// Cómo se edita cada campo: rich = editor de texto enriquecido, textarea =
// texto plano de varias líneas, text = una línea (con sugerencias en
// "Doctor que lo envía").
export const FIELD_KIND: Record<
  ConsultationField,
  "rich" | "textarea" | "text"
> = {
  chiefComplaint: "rich",
  examinationFindings: "rich",
  evolution: "rich",
  diagnosis: "textarea",
  treatment: "rich",
  report: "rich",
  followUpNotes: "textarea",
  referringDoctor: "text",
};

const DEFAULT_LABELS: Record<ConsultationField, string> = {
  chiefComplaint: "Motivo de consulta",
  examinationFindings: "Exploración",
  evolution: "Evolución",
  diagnosis: "Diagnóstico",
  treatment: "Tratamiento",
  report: "Informe",
  followUpNotes: "Notas de seguimiento",
  referringDoctor: "Doctor que lo envía",
};

interface TemplateDefinition {
  name: string;
  fields: ConsultationField[];
  labels?: Partial<Record<ConsultationField, string>>;
}

export const TEMPLATE_DEFINITIONS: Record<
  ConsultationTemplate,
  TemplateDefinition
> = {
  orl: {
    name: "Otorrinolaringología",
    fields: [
      "chiefComplaint",
      "examinationFindings",
      "diagnosis",
      "treatment",
      "followUpNotes",
    ],
  },
  cirugia: {
    name: "Cirugía",
    fields: [
      "chiefComplaint",
      "evolution",
      "diagnosis",
      "report",
      "referringDoctor",
    ],
    labels: { chiefComplaint: "Enfermedad actual" },
  },
};

export const ALL_CONSULTATION_FIELDS = Object.keys(
  DEFAULT_LABELS,
) as ConsultationField[];

export function fieldLabel(
  template: ConsultationTemplate,
  field: ConsultationField,
): string {
  return (
    TEMPLATE_DEFINITIONS[template].labels?.[field] ?? DEFAULT_LABELS[field]
  );
}

// Los campos de la plantilla y, detrás, cualquier otro que ya tenga datos
// (una consulta importada o de antes de cambiar de plantilla): nada escrito
// queda oculto ni se pierde al editar.
export function visibleFields(
  template: ConsultationTemplate,
  entry?: Partial<Record<ConsultationField, string | null>>,
  // Campos marcados para la clínica (GET /settings/consultation-template);
  // sin ellos, los de la plantilla.
  enabledFields?: ConsultationField[],
): ConsultationField[] {
  const fields = enabledFields ?? TEMPLATE_DEFINITIONS[template].fields;
  if (!entry) return fields;
  const extra = ALL_CONSULTATION_FIELDS.filter(
    (field) => !fields.includes(field) && !!entry[field],
  );
  return [...fields, ...extra];
}
