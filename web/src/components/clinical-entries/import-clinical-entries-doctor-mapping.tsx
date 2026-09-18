"use client";

import { Label } from "@/components/ui/label";
import type { PractitionerOption } from "@/lib/practitioners";

interface ImportClinicalEntriesDoctorMappingProps {
  doctorNames: string[];
  practitioners: PractitionerOption[];
  mapping: Record<string, string | undefined>;
  onChange: (mapping: Record<string, string | undefined>) => void;
  disabled?: boolean;
}

// Paso 2 del asistente de Consultas: un nombre de médico distinto del
// fichero por fila, cada uno con un select de a qué profesional
// corresponde — author_user_id es obligatorio en clinical_entries, así
// que un nombre sin elegir aquí deja sus filas sin importar (se reporta
// como omitidas, no bloquea el resto del fichero).
export function ImportClinicalEntriesDoctorMapping({
  doctorNames,
  practitioners,
  mapping,
  onChange,
  disabled,
}: ImportClinicalEntriesDoctorMappingProps) {
  if (doctorNames.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="text-sm font-medium">
        Relaciona cada médico del fichero con un profesional
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {doctorNames.map((name) => (
          <div key={name} className="space-y-1">
            <Label htmlFor={`ce-doctor-${name}`}>{name}</Label>
            <select
              id={`ce-doctor-${name}`}
              value={mapping[name] ?? ""}
              disabled={disabled}
              onChange={(e) => onChange({ ...mapping, [name]: e.target.value || undefined })}
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50"
            >
              <option value="">Sin asignar — sus consultas se omitirán</option>
              {practitioners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
