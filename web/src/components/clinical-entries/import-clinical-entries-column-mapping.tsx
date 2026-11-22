"use client";

import { Label } from "@/components/ui/label";
import type {
  ClinicalEntriesImportPreview,
  ClinicalEntryColumnMapping,
} from "@/lib/actions/clinical-entries-import";
import {
  CONSULTATION_TEMPLATES,
  DEFAULT_CONSULTATION_TEMPLATE,
  TEMPLATE_DEFINITIONS,
  fieldLabel,
  type ConsultationField,
  type ConsultationTemplate,
} from "@/lib/consultation-template";

// Un selector por cada campo de la plantilla de la clínica, con su
// etiqueta (en Cirugía "Enfermedad actual", "Informe", "Doctor que lo
// envía"...). Motivo/Enfermedad actual es el único obligatorio.
function plainFields(
  template: ConsultationTemplate,
  fields: ConsultationField[],
): { field: ConsultationField; label: string; required: boolean }[] {
  return fields.map((field) => ({
    field,
    label: fieldLabel(template, field),
    required: field === "chiefComplaint",
  }));
}

// One special select per field that isn't a straight column->field copy —
// visitDate/patientLegacyId/insuranceEntityName/doctorName all need
// resolution on the backend (a date to parse, a Nº de historia to look up,
// a name to resolve to an id), same reasoning as ColumnMapping's own split
// in the Pacientes wizard.
const SPECIAL_FIELDS: {
  field: keyof Pick<
    ClinicalEntryColumnMapping,
    | "visitDate"
    | "patientLegacyId"
    | "patientFirstName"
    | "patientLastName"
    | "insuranceEntityName"
    | "doctorName"
  >;
  label: string;
}[] = [
  { field: "visitDate", label: "Fecha" },
  { field: "patientLegacyId", label: "Nº de historia" },
  // No son obligatorios para importar (chiefComplaint + patientLegacyId ya
  // bastan), pero sin ellos se pierde la comprobación de seguridad que
  // detecta un nº de historia reutilizado en el fichero legado — conviene
  // mapearlos siempre que el fichero los traiga.
  { field: "patientFirstName", label: "Nombre del paciente (comprobación)" },
  { field: "patientLastName", label: "Apellidos del paciente (comprobación)" },
  { field: "insuranceEntityName", label: "Aseguradora" },
  { field: "doctorName", label: "Doctor (quien atendió la consulta)" },
];

function sampleFor(
  preview: ClinicalEntriesImportPreview,
  header: string | undefined,
): string {
  if (!header) return "";
  const values = preview.sampleRows
    .map((row) => row[header])
    .filter((v): v is string => !!v)
    .slice(0, 2);
  return values.length > 0 ? `Ej.: ${values.join(", ")}` : "";
}

interface ImportClinicalEntriesColumnMappingProps {
  preview: ClinicalEntriesImportPreview;
  mapping: ClinicalEntryColumnMapping;
  onChange: (mapping: ClinicalEntryColumnMapping) => void;
  disabled?: boolean;
}

// Paso 1 del asistente de Consultas: mismo patrón que
// ImportColumnMapping (Pacientes) — un <select> por campo, poblado con
// las columnas reales del fichero.
export function ImportClinicalEntriesColumnMapping({
  preview,
  mapping,
  onChange,
  disabled,
}: ImportClinicalEntriesColumnMappingProps) {
  const template = (CONSULTATION_TEMPLATES as readonly string[]).includes(preview.template)
    ? preview.template
    : DEFAULT_CONSULTATION_TEMPLATE;
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="text-sm font-medium">Relaciona cada columna del fichero con su campo</p>
      <p className="text-xs text-muted-foreground">
        Campos de la plantilla de consulta de la clínica:{" "}
        {TEMPLATE_DEFINITIONS[template].name}.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {plainFields(template, preview.fields ?? TEMPLATE_DEFINITIONS[template].fields).map(({ field, label, required }) => {
          const selected = mapping[field] ?? "";
          return (
            <div key={field} className="space-y-1">
              <Label htmlFor={`ce-mapping-${field}`}>
                {label}
                {required && <span className="text-destructive"> *</span>}
              </Label>
              <select
                id={`ce-mapping-${field}`}
                value={selected}
                disabled={disabled}
                onChange={(e) => onChange({ ...mapping, [field]: e.target.value || undefined })}
                className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50"
              >
                <option value="">{required ? "Selecciona una columna…" : "No importar"}</option>
                {preview.headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
              <p className="min-h-4 truncate text-xs text-muted-foreground">
                {sampleFor(preview, selected)}
              </p>
            </div>
          );
        })}
        {SPECIAL_FIELDS.map(({ field, label }) => {
          const selected = mapping[field] ?? "";
          return (
            <div key={field} className="space-y-1">
              <Label htmlFor={`ce-mapping-${field}`}>{label}</Label>
              <select
                id={`ce-mapping-${field}`}
                value={selected}
                disabled={disabled}
                onChange={(e) => onChange({ ...mapping, [field]: e.target.value || undefined })}
                className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50"
              >
                <option value="">No importar</option>
                {preview.headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
              <p className="min-h-4 truncate text-xs text-muted-foreground">
                {sampleFor(preview, selected)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
