"use client";

import { useState, useTransition } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createInsuranceEntityAction,
  deleteInsuranceEntityAction,
  updateInsuranceEntityAction,
} from "@/lib/actions/settings";
import type { InsuranceEntity } from "@/lib/types";

interface InsuranceEntitiesFormProps {
  initialEntities: InsuranceEntity[];
}

export function InsuranceEntitiesForm({ initialEntities }: InsuranceEntitiesFormProps) {
  const [entities, setEntities] = useState(
    [...initialEntities].sort((a, b) => a.name.localeCompare(b.name, "es")),
  );
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addEntity() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const state = await createInsuranceEntityAction(name);
      if (state.error) {
        setError(state.error);
        return;
      }
      if (state.entity) {
        setEntities((prev) => [...prev, state.entity!]);
        setNewName("");
      }
    });
  }

  function renameEntity(id: string, name: string) {
    setEntities((prev) => prev.map((e) => (e.id === id ? { ...e, name } : e)));
  }

  function commitRename(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const state = await updateInsuranceEntityAction(id, trimmed);
      if (state.error) setError(state.error);
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const state = await deleteInsuranceEntityAction(id);
      if (state.error) {
        setError(state.error);
        return;
      }
      setEntities((prev) => prev.filter((e) => e.id !== id));
    });
  }

  return (
    <div className="space-y-3">
      <div className="divide-y rounded-md border">
        {entities.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">Sin aseguradoras todavía.</p>
        )}
        {entities.map((entity) => (
          <div key={entity.id} className="flex items-center gap-2 p-2">
            <Input
              value={entity.name}
              onChange={(e) => renameEntity(entity.id, e.target.value)}
              onBlur={(e) => commitRename(entity.id, e.target.value)}
              disabled={pending}
              className="h-9 flex-1"
            />
            <button
              type="button"
              onClick={() => remove(entity.id)}
              disabled={pending}
              aria-label={`Eliminar ${entity.name}`}
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
          <Label htmlFor="new-insurance" className="text-xs text-muted-foreground">
            Nueva aseguradora
          </Label>
          <Input
            id="new-insurance"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addEntity();
              }
            }}
            disabled={pending}
            placeholder="p. ej. Sanitas"
          />
        </div>
        <Button type="button" onClick={addEntity} disabled={pending || !newName.trim()}>
          <PlusIcon data-icon="inline-start" />
          Añadir
        </Button>
      </div>
    </div>
  );
}
