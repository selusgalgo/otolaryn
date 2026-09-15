"use client";

import { Label } from "@/components/ui/label";
import type { ColumnMapping, ImportPreview } from "@/lib/actions/patients";
import type { AntecedenteType } from "@/lib/types";

type PlainField = Exclude<keyof ColumnMapping, "insuranceEntityName" | "antecedentes">;

const FIELDS: { field: PlainField; label: string; required: boolean }[] = [
  { field: "firstName", label: "Nombre", required: true },
  { field: "lastName", label: "Apellidos", required: true },
  { field: "documentId", label: "Documento", required: false },
  { field: "dateOfBirth", label: "Fecha de nacimiento", required: true },
  { field: "phone", label: "Teléfono", required: true },
  { field: "email", label: "Email", required: false },
  { field: "address", label: "Dirección", required: false },
  { field: "notes", label: "Notas", required: false },
  { field: "profession", label: "Profesión", required: false },
  { field: "legacyId", label: "Nº de historia", required: false },
  { field: "firstConsultationDate", label: "Fecha de la primera cita", required: false },
];

// Up to 2 real sample values from the column currently chosen for a field,
// shown right under its select — the whole point of this step is letting
// someone see "column X actually holds these values" before committing,
// not just picking a name off a list blind.
function sampleFor(preview: ImportPreview, field: string, header: string | undefined): string {
  if (!header) {
    // documentId is the one field this app can fill in on its own when
    // the file simply doesn't have an equivalent column — worth saying
    // so here, otherwise leaving it unmapped looks like an oversight
    // rather than a deliberate, supported choice.
    return field === "documentId" ? "Se generará un identificador automáticamente" : "";
  }
  const values = preview.sampleRows
    .map((row) => row[header])
    .filter((v): v is string => !!v)
    .slice(0, 2);
  return values.length > 0 ? `Ej.: ${values.join(", ")}` : "";
}

interface ImportColumnMappingProps {
  preview: ImportPreview;
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
  disabled?: boolean;
  // Active antecedente types for this tenant — each gets its own mapping
  // row ("Antecedente: Tabaco" -> the file's TABACO column, say), since
  // the legacy file has one column per antecedente rather than a single
  // "antecedentes" column. Omitted (or empty) simply shows none of these
  // rows, same graceful fallback as everywhere else this list is optional.
  antecedenteTypes?: AntecedenteType[];
}

// The mapping wizard's core: one row per field of ours, each with a
// <select> populated with the file's own columns — never the other way
// around, since the file's columns are the fixed vocabulary here (e.g. a
// legacy export's own patient id column might be called NUMHISTORIA, not
// "Documento", and needs to still be pickable for "Documento").
export function ImportColumnMapping({
  preview,
  mapping,
  onChange,
  disabled,
  antecedenteTypes,
}: ImportColumnMappingProps) {
  function setPlainField(field: PlainField, header: string) {
    onChange({ ...mapping, [field]: header || undefined });
  }

  function setAntecedenteColumn(typeId: string, header: string) {
    onChange({
      ...mapping,
      antecedentes: { ...mapping.antecedentes, [typeId]: header || undefined },
    });
  }

  return (
    <div className="space-y-4 rounded-lg border p-3">
      <div className="space-y-3">
        <p className="text-sm font-medium">Relaciona cada columna del fichero con su campo</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map(({ field, label, required }) => {
            const selected = mapping[field] ?? "";
            return (
              <div key={field} className="space-y-1">
                <Label htmlFor={`mapping-${field}`}>
                  {label}
                  {(field === "dateOfBirth" || field === "firstConsultationDate") && (
                    <span className="text-muted-foreground"> (DD/MM/AAAA)</span>
                  )}
                  {required && <span className="text-destructive"> *</span>}
                </Label>
                <select
                  id={`mapping-${field}`}
                  value={selected}
                  disabled={disabled}
                  onChange={(e) => setPlainField(field, e.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm disabled:opacity-50"
                >
                  <option value="">{required ? "Selecciona una columna…" : "No importar"}</option>
                  {preview.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
                <p className="min-h-4 truncate text-xs text-muted-foreground">
                  {sampleFor(preview, field, selected)}
                </p>
              </div>
            );
          })}
          <div className="space-y-1">
            <Label htmlFor="mapping-insurance">Aseguradora</Label>
            <select
              id="mapping-insurance"
              value={mapping.insuranceEntityName ?? ""}
              disabled={disabled}
              onChange={(e) =>
                onChange({ ...mapping, insuranceEntityName: e.target.value || undefined })
              }
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm disabled:opacity-50"
            >
              <option value="">No importar</option>
              {preview.headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
            <p className="min-h-4 truncate text-xs text-muted-foreground">
              {sampleFor(preview, "insuranceEntityName", mapping.insuranceEntityName)}
            </p>
          </div>
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
                  <Label htmlFor={`mapping-antecedente-${type.id}`}>{type.name}</Label>
                  <select
                    id={`mapping-antecedente-${type.id}`}
                    value={selected}
                    disabled={disabled}
                    onChange={(e) => setAntecedenteColumn(type.id, e.target.value)}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm disabled:opacity-50"
                  >
                    <option value="">No importar</option>
                    {preview.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                  <p className="min-h-4 truncate text-xs text-muted-foreground">
                    {sampleFor(preview, type.id, selected)}
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
