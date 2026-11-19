// Plantillas de consulta por clínica (Tenant.consultationTemplate). Cada
// clínica ve en Nueva consulta / ficha / PDF solo los campos de su plantilla,
// en ese orden. Los campos son siempre columnas reales de clinical_entries
// (no un JSON libre): así la búsqueda, el PDF y la importación siguen
// trabajando con datos tipados, y añadir una plantilla nueva es añadir una
// entrada aquí (y su valor al CHECK de la migración).
//
// chiefComplaint es el campo obligatorio de toda consulta en TODAS las
// plantillas — cambia solo cómo se llama ("Motivo de consulta" en ORL,
// "Enfermedad actual" en cirugía, que es el mismo dato).
//
// Copia en la web: web/src/lib/consultation-template.ts — mantener ambas
// iguales.

export const CONSULTATION_TEMPLATES = ['orl', 'cirugia'] as const;
export type ConsultationTemplate = (typeof CONSULTATION_TEMPLATES)[number];

export const DEFAULT_CONSULTATION_TEMPLATE: ConsultationTemplate = 'orl';

export type ConsultationField =
  | 'chiefComplaint'
  | 'examinationFindings'
  | 'evolution'
  | 'diagnosis'
  | 'treatment'
  | 'report'
  | 'followUpNotes'
  | 'referringDoctor';

const DEFAULT_LABELS: Record<ConsultationField, string> = {
  chiefComplaint: 'Motivo de consulta',
  examinationFindings: 'Exploración',
  evolution: 'Evolución',
  diagnosis: 'Diagnóstico',
  treatment: 'Tratamiento',
  report: 'Informe',
  followUpNotes: 'Notas de seguimiento',
  referringDoctor: 'Doctor que lo envía',
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
    name: 'Otorrinolaringología',
    fields: [
      'chiefComplaint',
      'examinationFindings',
      'diagnosis',
      'treatment',
      'followUpNotes',
    ],
  },
  cirugia: {
    name: 'Cirugía',
    fields: [
      'chiefComplaint',
      'evolution',
      'diagnosis',
      'report',
      'referringDoctor',
    ],
    labels: { chiefComplaint: 'Enfermedad actual' },
  },
};

const ALL_FIELDS = Object.keys(DEFAULT_LABELS) as ConsultationField[];

export function fieldLabel(
  template: ConsultationTemplate,
  field: ConsultationField,
): string {
  return (
    TEMPLATE_DEFINITIONS[template].labels?.[field] ?? DEFAULT_LABELS[field]
  );
}

// Campos a mostrar de una consulta concreta: los de la plantilla y, detrás,
// cualquier otro que tenga datos. Si una clínica cambia de plantilla (o una
// consulta se importó con un campo que su plantilla no usa), ese texto
// nunca queda oculto ni se pierde.
export function visibleFields(
  template: ConsultationTemplate,
  entry: Partial<Record<ConsultationField, string | null>>,
): ConsultationField[] {
  const fields = TEMPLATE_DEFINITIONS[template].fields;
  const extra = ALL_FIELDS.filter(
    (field) => !fields.includes(field) && !!entry[field],
  );
  return [...fields, ...extra];
}
