"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ClinicalEntryFormState } from "@/lib/actions/clinical-entries";

interface ClinicalEntryFormProps {
  action: (prevState: ClinicalEntryFormState, formData: FormData) => Promise<ClinicalEntryFormState>;
}

const initialState: ClinicalEntryFormState = {};

// No edit form on purpose: clinical_entries is append-only on the backend
// (no PATCH endpoint exists at all), so there's nothing to build a UI for.
export function ClinicalEntryForm({ action }: ClinicalEntryFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      <div className="space-y-2">
        <Label htmlFor="visitDate">Fecha de la consulta</Label>
        <Input id="visitDate" name="visitDate" type="datetime-local" disabled={pending} />
        <p className="text-xs text-muted-foreground">Si se deja vacío, se usa la fecha y hora actuales.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="chiefComplaint">Motivo de consulta</Label>
        <Textarea id="chiefComplaint" name="chiefComplaint" required disabled={pending} rows={2} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="examinationFindings">Exploración</Label>
        <Textarea id="examinationFindings" name="examinationFindings" disabled={pending} rows={3} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="diagnosis">Diagnóstico</Label>
        <Textarea id="diagnosis" name="diagnosis" disabled={pending} rows={2} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="treatment">Tratamiento</Label>
        <Textarea id="treatment" name="treatment" disabled={pending} rows={2} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="followUpNotes">Notas de seguimiento</Label>
        <Textarea id="followUpNotes" name="followUpNotes" disabled={pending} rows={2} />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Guardando..." : "Guardar entrada"}
      </Button>
    </form>
  );
}
