"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchPatientsAction } from "@/lib/actions/patients";
import {
  HOLDER_RELATIONSHIP_LABEL,
  type HolderRelationship,
  type Patient,
  type PatientLinkSummary,
} from "@/lib/types";
import { formatDocumentId, formatLegacyId } from "@/lib/utils";

interface HolderPickerProps {
  // El propio paciente: nunca se ofrece como su titular.
  patientId: string;
  initialHolder: PatientLinkSummary | null;
  initialRelationship: HolderRelationship | null;
  // Un paciente con familiares a cargo no puede pasar a ser familiar de
  // otro (el backend lo rechaza igualmente): se explica en vez de ofrecerlo.
  hasDependents: boolean;
  disabled?: boolean;
}

function holderLine(p: PatientLinkSummary): string {
  return [
    p.legacyId && `Nº ${formatLegacyId(p.legacyId)}`,
    p.documentId && formatDocumentId(p.documentId),
  ]
    .filter(Boolean)
    .join(" · ");
}

// "Familiar a cargo de": buscar al titular (otro paciente de la clínica) y
// elegir el parentesco. Va dentro del formulario de edición de la ficha;
// envía holderPatientId/holderRelationship como campos ocultos (vacíos =
// quitar el vínculo).
export function HolderPicker({
  patientId,
  initialHolder,
  initialRelationship,
  hasDependents,
  disabled,
}: HolderPickerProps) {
  const [holder, setHolder] = useState<PatientLinkSummary | null>(
    initialHolder,
  );
  const [relationship, setRelationship] = useState<HolderRelationship | "">(
    initialRelationship ?? "",
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || holder) {
      setResults([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      searchPatientsAction(query)
        // Ni él mismo ni quien ya es familiar a cargo de otro (sin cadenas).
        .then((found) =>
          setResults(
            found.filter((p) => p.id !== patientId && !p.holderPatientId),
          ),
        )
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, holder, patientId]);

  if (hasDependents) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">
          Familiar a cargo de
        </Label>
        <p className="text-xs text-muted-foreground">
          Este paciente es titular de otros, así que no puede ser a su vez
          familiar a cargo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name="holderPatientId" value={holder?.id ?? ""} />
      <input
        type="hidden"
        name="holderRelationship"
        value={holder ? relationship : ""}
      />
      <Label htmlFor="holder-search" className="text-xs text-muted-foreground">
        Familiar a cargo de (titular)
      </Label>
      {holder ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
            <span>
              <span className="font-medium">
                {holder.firstName} {holder.lastName}
              </span>
              {holderLine(holder) && (
                <span className="block text-xs text-muted-foreground">
                  {holderLine(holder)}
                </span>
              )}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setHolder(null);
                setRelationship("");
              }}
            >
              Quitar
            </Button>
          </div>
          <div className="space-y-1">
            <Label
              htmlFor="holder-relationship"
              className="text-xs text-muted-foreground"
            >
              Parentesco
            </Label>
            <select
              id="holder-relationship"
              value={relationship}
              onChange={(e) =>
                setRelationship(e.target.value as HolderRelationship | "")
              }
              disabled={disabled}
              required
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50"
            >
              <option value="">Elige el parentesco…</option>
              {(
                Object.keys(HOLDER_RELATIONSHIP_LABEL) as HolderRelationship[]
              ).map((r) => (
                <option key={r} value={r}>
                  {HOLDER_RELATIONSHIP_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <Input
            id="holder-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar titular por nombre, DNI o nº de historia…"
            autoComplete="off"
            disabled={disabled}
          />
          {searching && (
            <p className="text-xs text-muted-foreground">Buscando…</p>
          )}
          {results.length > 0 && (
            <ul className="max-h-48 overflow-y-auto rounded-md border text-sm">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full px-2 py-1.5 text-left hover:bg-muted"
                    onClick={() => {
                      setHolder({
                        id: p.id,
                        firstName: p.firstName,
                        lastName: p.lastName,
                        documentId: p.documentId,
                        legacyId: p.legacyId,
                      });
                      setQuery("");
                    }}
                  >
                    <span className="font-medium">
                      {p.firstName} {p.lastName}
                    </span>
                    {holderLine(p) && (
                      <span className="block text-xs text-muted-foreground">
                        {holderLine(p)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!searching && query.trim() && results.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin resultados.</p>
          )}
        </div>
      )}
    </div>
  );
}
