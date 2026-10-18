"use client";

import { Label } from "@/components/ui/label";
import type { UpdateColumnMapping, UpdateImportPreview } from "@/lib/actions/patients";
import type { AntecedenteType } from "@/lib/types";

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

// Versión reducida de ImportColumnMapping para la actualización masiva:
// solo tres cosas se pueden mapear (Nº de historia para localizar al
// paciente, Primera consulta y antecedentes) — a propósito, ya que este
// modo nunca toca el resto de la ficha. Misma lógica de desambiguar
// nombres repetidos entre categorías que la importación de pacientes
// nuevos.
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
