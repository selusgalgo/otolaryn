"use client";

import { useState, useTransition } from "react";
import { PencilIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { updatePatientAntecedentesAction } from "@/lib/actions/antecedentes";
import type { AntecedenteType, PatientAntecedente } from "@/lib/types";

interface PatientAntecedentesCardProps {
  patientId: string;
  types: AntecedenteType[];
  initialMarked: PatientAntecedente[];
}

interface RowState {
  checked: boolean;
  detalle: string;
}

function buildRows(
  visibleTypes: AntecedenteType[],
  markedByType: Map<string, PatientAntecedente>,
): Map<string, RowState> {
  return new Map(
    visibleTypes.map((t) => {
      const existing = markedByType.get(t.id);
      return [t.id, { checked: !!existing, detalle: existing?.detalle ?? "" }];
    }),
  );
}

// A checkbox + an optional short text next to it, one row per antecedente
// type — not a plain sí/no list: the real legacy data behind this (see
// pacientes.xls) almost always carries a nuance ("4-5 cigarrillos/día",
// "Alérgico al melocotón"), so the checkbox alone would throw that away.
//
// Two modes: at rest, only the marked antecedentes show (a quick read for
// a clínico skimming the chart) — the full checklist (every active type,
// to mark new ones or edit detalle) only appears once "Editar" is
// pressed, and "Cancelar" discards any unsaved change and returns to the
// read view. One "Guardar" for the whole card, same full-replace shape as
// ScheduleForm/AntecedenteTypesForm rather than a save per row.
export function PatientAntecedentesCard({
  patientId,
  types,
  initialMarked,
}: PatientAntecedentesCardProps) {
  // Inactive types stay out of the checklist unless already marked on this
  // patient — a deprecated antecedente shouldn't be offered for new use,
  // but one already recorded here must stay visible, not vanish.
  const markedByType = new Map(initialMarked.map((m) => [m.antecedenteTypeId, m]));
  const visibleTypes = types
    .filter((t) => t.active || markedByType.has(t.id))
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Map<string, RowState>>(() => buildRows(visibleTypes, markedByType));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const markedTypes = visibleTypes.filter((t) => rows.get(t.id)?.checked);

  function toggle(typeId: string, checked: boolean) {
    setSaved(false);
    setRows((prev) => new Map(prev).set(typeId, { ...prev.get(typeId)!, checked }));
  }

  function setDetalle(typeId: string, detalle: string) {
    setSaved(false);
    setRows((prev) => new Map(prev).set(typeId, { ...prev.get(typeId)!, detalle }));
  }

  function cancelEdit() {
    setRows(buildRows(visibleTypes, markedByType));
    setError(null);
    setEditing(false);
  }

  function save() {
    setError(null);
    const items = Array.from(rows.entries())
      .filter(([, row]) => row.checked)
      .map(([antecedenteTypeId, row]) => ({
        antecedenteTypeId,
        ...(row.detalle.trim() ? { detalle: row.detalle.trim() } : {}),
      }));
    startTransition(async () => {
      const state = await updatePatientAntecedentesAction(patientId, items);
      if (state.error) {
        setError(state.error);
        return;
      }
      setSaved(true);
      setEditing(false);
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Antecedentes</CardTitle>
        {editing ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={cancelEdit} disabled={pending}>
              Cancelar
            </Button>
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <PencilIcon data-icon="inline-start" />
            Editar
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {visibleTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay antecedentes configurados — añádelos desde Configuración.
          </p>
        ) : editing ? (
          // Una sola columna: la tarjeta vive en el hueco de la derecha
          // junto a Historia clínica, donde dos columnas dejaban la
          // etiqueta cortada y el campo de detalle sin sitio.
          <div className="grid grid-cols-1 gap-y-2">
            {visibleTypes.map((type) => {
              const row = rows.get(type.id)!;
              return (
                <div key={type.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`antecedente-${type.id}`}
                    checked={row.checked}
                    onCheckedChange={(checked) => toggle(type.id, checked === true)}
                    disabled={pending}
                  />
                  <label htmlFor={`antecedente-${type.id}`} className="w-40 shrink-0 text-sm">
                    {type.name}
                  </label>
                  <Input
                    value={row.detalle}
                    onChange={(e) => setDetalle(type.id, e.target.value)}
                    disabled={pending || !row.checked}
                    placeholder={row.checked ? "Detalle (opcional)" : ""}
                    className="h-8 flex-1"
                  />
                </div>
              );
            })}
          </div>
        ) : markedTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin antecedentes marcados.</p>
        ) : (
          <ul className="space-y-1.5">
            {markedTypes.map((type) => {
              const row = rows.get(type.id)!;
              return (
                <li key={type.id} className="text-sm">
                  <span className="font-medium">{type.name}</span>
                  {row.detalle && <span className="text-muted-foreground"> — {row.detalle}</span>}
                </li>
              );
            })}
          </ul>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && !error && <p className="text-sm text-success">Antecedentes guardados.</p>}
      </CardContent>
    </Card>
  );
}
