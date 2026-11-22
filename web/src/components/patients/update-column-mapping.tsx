"use client";

import { Label } from "@/components/ui/label";
import type { UpdateColumnMapping, UpdateImportPreview } from "@/lib/actions/patients";
import type { AntecedenteType } from "@/lib/types";

// Campos simples que el fichero puede sobrescribir. "Aseguradora" es el
// nombre (el backend lo resuelve a la aseguradora, creándola si es nueva).
const PATIENT_FIELDS: { field: Exclude<keyof UpdateColumnMapping, "legacyId" | "firstConsultationOverride" | "notes" | "antecedentes">; label: string }[] = [
  { field: "documentId", label: "Documento" },
  { field: "dateOfBirth", label: "Fecha de nacimiento" },
  { field: "gender", label: "Género" },
  { field: "phone", label: "Teléfono" },
  { field: "phone2", label: "Teléfono 2" },
  { field: "email", label: "Email" },
  { field: "address", label: "Dirección" },
  { field: "city", label: "Ciudad/Población" },
  { field: "province", label: "Provincia" },
  { field: "postalCode", label: "C.P." },
  { field: "profession", label: "Profesión" },
  { field: "drugAllergies", label: "Alergias medicamentosas" },
  { field: "currentMedications", label: "Medicación actual" },
  { field: "insuranceEntityName", label: "Aseguradora" },
  { field: "insuranceNumber", label: "Nº de seguro privado" },
];

function sampleFor(preview: UpdateImportPreview, header: string | undefined): string {
  if (!header) return "";
  const values = preview.sampleRows
    .map((row) => row[header])
    .filter((v): v is string => !!v)
    .slice(0, 2);
  return values.length > 0 ? `Ej.: ${values.join(", ")}` : "";
}

interface UpdateColumnMappingProps {
  preview: UpdateImportPreview;
  mapping: UpdateColumnMapping;
  onChange: (mapping: UpdateColumnMapping) => void;
  disabled?: boolean;
  antecedenteTypes?: AntecedenteType[];
}

// Versión de ImportColumnMapping para la actualización masiva: Nº de
// historia localiza al paciente y solo se tocan las columnas que se
// relacionen (nada más de la ficha), sin nombres ni Nº de historia como
// dato. Misma lógica de desambiguar nombres repetidos entre categorías que
// la importación de pacientes nuevos.
export function UpdateColumnMappingForm({
  preview,
  mapping,
  onChange,
  disabled,
  antecedenteTypes,
}: UpdateColumnMappingProps) {
  const nameCounts = new Map<string, number>();
  for (const type of antecedenteTypes ?? []) {
    nameCounts.set(type.name, (nameCounts.get(type.name) ?? 0) + 1);
  }
  function antecedenteLabel(type: AntecedenteType): string {
    return (nameCounts.get(type.name) ?? 0) > 1
      ? `${type.name} (${type.category === "familiar" ? "familiar" : "personal"})`
      : type.name;
  }

  function setAntecedenteColumn(typeId: string, header: string) {
    onChange({
      ...mapping,
      antecedentes: { ...mapping.antecedentes, [typeId]: header || undefined },
    });
  }

  return (
    <div className="space-y-4 rounded-lg border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="mapping-legacyId">
            Nº de historia
            <span className="text-destructive"> *</span>
          </Label>
          <select
            id="mapping-legacyId"
            value={mapping.legacyId ?? ""}
            disabled={disabled}
            onChange={(e) => onChange({ ...mapping, legacyId: e.target.value || undefined })}
            className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50"
          >
            <option value="">Selecciona una columna…</option>
            {preview.headers.map((header) => (
              <option key={header} value={header}>
                {header}
              </option>
            ))}
          </select>
          <p className="min-h-4 truncate text-xs text-muted-foreground">
            {sampleFor(preview, mapping.legacyId)}
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="mapping-firstConsultationOverride">Primera consulta</Label>
          <select
            id="mapping-firstConsultationOverride"
            value={mapping.firstConsultationOverride ?? ""}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...mapping, firstConsultationOverride: e.target.value || undefined })
            }
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
            {sampleFor(preview, mapping.firstConsultationOverride)}
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="mapping-notes">Historia clínica</Label>
          <select
            id="mapping-notes"
            value={mapping.notes ?? ""}
            disabled={disabled}
            onChange={(e) => onChange({ ...mapping, notes: e.target.value || undefined })}
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
            {sampleFor(preview, mapping.notes)}
          </p>
        </div>
      </div>

      <div className="space-y-3 border-t pt-3">
        <p className="text-sm font-medium">
          Datos del paciente — se sobrescribe el valor guardado (opcional)
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {PATIENT_FIELDS.map(({ field, label }) => (
            <div key={field} className="space-y-1">
              <Label htmlFor={`mapping-${field}`}>{label}</Label>
              <select
                id={`mapping-${field}`}
                value={mapping[field] ?? ""}
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
                {sampleFor(preview, mapping[field])}
              </p>
            </div>
          ))}
        </div>
      </div>

      {antecedenteTypes && antecedenteTypes.length > 0 && (
        <div className="space-y-3 border-t pt-3">
          <p className="text-sm font-medium">
            Antecedentes — relaciona la columna de cada uno (opcional)
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {antecedenteTypes.map((type) => {
              const selected = mapping.antecedentes?.[type.id] ?? "";
              return (
                <div key={type.id} className="space-y-1">
                  <Label htmlFor={`mapping-antecedente-${type.id}`}>{antecedenteLabel(type)}</Label>
                  <select
                    id={`mapping-antecedente-${type.id}`}
                    value={selected}
                    disabled={disabled}
                    onChange={(e) => setAntecedenteColumn(type.id, e.target.value)}
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
      )}
    </div>
  );
}
