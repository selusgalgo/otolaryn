"use client";

import { useActionState, useRef, useState } from "react";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importPatientsAction } from "@/lib/actions/patients";
import type { ImportPatientsState } from "@/lib/actions/patients";

const initialState: ImportPatientsState = {};

// Doesn't auto-close on success like the other dialogs (CreatePatientDialog
// etc.) — a partial import (some rows skipped) is the expected common
// case here, not an error, and the user needs to actually read which rows
// and why before dismissing it themselves.
export function ImportPatientsDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(importPatientsAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) formRef.current?.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <UploadIcon data-icon="inline-start" />
          Importar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar pacientes desde CSV</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={formAction} className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="file">Fichero CSV</Label>
            <Input id="file" name="file" type="file" accept=".csv,text/csv" required disabled={pending} />
            <p className="text-xs text-muted-foreground">
              Mismas columnas que la exportación: Nombre, Apellidos, Documento, Fecha de nacimiento
              (AAAA-MM-DD), Teléfono, Email, Dirección, Notas. Nombre, Apellidos, Documento, Fecha de
              nacimiento y Teléfono son obligatorios; un documento ya existente se omite en vez de
              duplicarse.
            </p>
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          {state.result && (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <p>
                <span className="font-medium">{state.result.created}</span> de{" "}
                {state.result.totalRows} pacientes importados.
              </p>
              {state.result.skipped.length > 0 && (
                <div className="space-y-1">
                  <p className="font-medium text-destructive">
                    {state.result.skipped.length} fila{state.result.skipped.length === 1 ? "" : "s"}{" "}
                    omitida{state.result.skipped.length === 1 ? "" : "s"}:
                  </p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {state.result.skipped.map((s) => (
                      <li key={s.row}>
                        Fila {s.row}: {s.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <Button type="submit" disabled={pending} className="w-fit">
            {pending ? (
              "Importando..."
            ) : (
              <>
                <UploadIcon data-icon="inline-start" />
                Importar
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
