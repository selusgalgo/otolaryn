"use client";

import { useState, useTransition } from "react";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createAntecedenteTypeAction,
  deleteAntecedenteTypeAction,
  updateAntecedenteTypeAction,
} from "@/lib/actions/settings";
import type { AntecedenteType } from "@/lib/types";

interface AntecedenteTypesFormProps {
  initialTypes: AntecedenteType[];
}

// Same "editable, tenant-owned catalog" shape as InsuranceEntitiesForm, one
// extra dimension: active/inactive and a display order, since a type
// already marked on a real patient can never be hard-deleted (see
// AntecedentesService.removeType) — desactivar is the everyday "remove
// this from the list" action, delete is only for one added by mistake.
export function AntecedenteTypesForm({ initialTypes }: AntecedenteTypesFormProps) {
  const [types, setTypes] = useState(
    [...initialTypes].sort((a, b) => a.displayOrder - b.displayOrder),
  );
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addType() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const state = await createAntecedenteTypeAction(name);
      if (state.error) {
        setError(state.error);
        return;
      }
      if (state.type) {
        setTypes((prev) => [...prev, state.type!]);
        setNewName("");
      }
    });
  }

  function renameType(id: string, name: string) {
    setTypes((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
  }

  function commitRename(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const state = await updateAntecedenteTypeAction(id, { name: trimmed });
      if (state.error) setError(state.error);
    });
  }

  function toggleActive(id: string, active: boolean) {
    setError(null);
    setTypes((prev) => prev.map((t) => (t.id === id ? { ...t, active } : t)));
    startTransition(async () => {
      const state = await updateAntecedenteTypeAction(id, { active });
      if (state.error) setError(state.error);
    });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= types.length) return;
    const swapped = [...types];
    [swapped[index], swapped[target]] = [swapped[target], swapped[index]];
    // displayOrder now just mirrors array position — simpler to keep them
    // in sync locally than to diff against the server's previous values.
    const reordered = swapped.map((t, i) => ({ ...t, displayOrder: i }));
    setTypes(reordered);
    setError(null);
    // Only the two swapped rows actually changed displayOrder — no need to
    // re-send the rest just because their array position stayed the same.
    startTransition(async () => {
      await Promise.all([
        updateAntecedenteTypeAction(reordered[index].id, { displayOrder: index }),
        updateAntecedenteTypeAction(reordered[target].id, { displayOrder: target }),
      ]);
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const state = await deleteAntecedenteTypeAction(id);
      if (state.error) {
        setError(state.error);
        return;
      }
      setTypes((prev) => prev.filter((t) => t.id !== id));
    });
  }

  return (
    <div className="space-y-3">
      <div className="divide-y rounded-md border">
        {types.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">Sin antecedentes todavía.</p>
        )}
        {types.map((type, index) => (
          <div key={type.id} className="flex items-center gap-2 p-2">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0 || pending}
                aria-label="Subir"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
              >
                <ArrowUpIcon className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === types.length - 1 || pending}
                aria-label="Bajar"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
              >
                <ArrowDownIcon className="size-3.5" />
              </button>
            </div>
            <Input
              value={type.name}
              onChange={(e) => renameType(type.id, e.target.value)}
              onBlur={(e) => commitRename(type.id, e.target.value)}
              disabled={pending}
              className="h-9 flex-1"
            />
            <label className="flex shrink-0 items-center gap-1.5 px-1 text-sm text-muted-foreground">
              <Checkbox
                checked={type.active}
                onCheckedChange={(checked) => toggleActive(type.id, checked === true)}
                disabled={pending}
              />
              Activo
            </label>
            <button
              type="button"
              onClick={() => remove(type.id)}
              disabled={pending}
              aria-label={`Eliminar ${type.name}`}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="new-antecedente" className="text-xs text-muted-foreground">
            Nuevo antecedente
          </Label>
          <Input
            id="new-antecedente"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addType();
              }
            }}
            disabled={pending}
            placeholder="p. ej. Hipotiroidismo"
          />
        </div>
        <Button type="button" onClick={addType} disabled={pending || !newName.trim()}>
          <PlusIcon data-icon="inline-start" />
          Añadir
        </Button>
      </div>
    </div>
  );
}
