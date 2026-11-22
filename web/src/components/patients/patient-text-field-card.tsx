"use client";

import { useActionState, useEffect, useState } from "react";
import { BeakerIcon, ExclamationTriangleIcon, PencilIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  updatePatientTextFieldAction,
  type PatientFormState,
  type PatientTextField,
} from "@/lib/actions/patients";

// Alergias: triángulo de alerta. Medicación: el matraz (Heroicons no trae
// un icono de pastilla).
function FieldIcon({ field, alert }: { field: PatientTextField; alert: boolean }) {
  return (
    <span
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-lg ${
        alert ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-muted text-muted-foreground"
      }`}
      aria-hidden
    >
      {field === "currentMedications" ? (
        <BeakerIcon className="size-6" />
      ) : (
        <ExclamationTriangleIcon className="size-6" />
      )}
    </span>
  );
}

interface PatientTextFieldCardProps {
  patientId: string;
  field: PatientTextField;
  title: string;
  value: string | null;
  emptyText: string;
  // Resalta en rojo cuando hay contenido (alergias medicamentosas).
  alert?: boolean;
}

const initialState: PatientFormState = {};

// Bloque de texto libre de la ficha con su propio "Editar", igual que los
// antecedentes: se lee de un vistazo y se edita sin abrir el formulario
// completo del paciente. Cada bloque guarda solo su campo.
export function PatientTextFieldCard({ patientId, field, title, value, emptyText, alert }: PatientTextFieldCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const boundUpdate = updatePatientTextFieldAction.bind(null, patientId, field);
  const [state, formAction, pending] = useActionState(boundUpdate, initialState);

  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state.success]);

  const highlighted = alert && !!value;

  return (
    <Card className={highlighted ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40" : undefined}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-3 text-base text-foreground">
          <FieldIcon field={field} alert={!!highlighted} />
          {title}
        </CardTitle>
        {!editing && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDraft(value ?? "");
              setEditing(true);
            }}
          >
            <PencilIcon data-icon="inline-start" />
            Editar
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <form action={formAction} className="space-y-3">
            <Textarea name="value" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={pending} rows={3} />
            {state.error && <p className="text-sm text-destructive">{state.error}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Guardando..." : "Guardar"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)} disabled={pending}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : value ? (
          <p className={`text-sm whitespace-pre-line text-foreground ${highlighted ? "font-bold" : ""}`}>{value}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        )}
      </CardContent>
    </Card>
  );
}
