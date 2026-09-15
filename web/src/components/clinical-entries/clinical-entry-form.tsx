"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ClinicalEntryFormState } from "@/lib/actions/clinical-entries";

interface ClinicalEntryFormProps {
  action: (prevState: ClinicalEntryFormState, formData: FormData) => Promise<ClinicalEntryFormState>;
}

const initialState: ClinicalEntryFormState = {};

// "YYYY-MM-DDTHH:MM" in the browser's own local time, what a
// datetime-local input needs. Built with local getters, not
// toISOString() (that's UTC) — this pre-fills a field the profesional
// reads in their own wall-clock time, not the server's.
function nowForDateTimeInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// No edit form on purpose: clinical_entries is append-only on the backend
// (no PATCH endpoint exists at all), so there's nothing to build a UI for.
export function ClinicalEntryForm({ action }: ClinicalEntryFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const visitDateRef = useRef<HTMLInputElement>(null);

  // Set imperatively after mount, not via defaultValue: "now" only means
  // anything in the browser's own clock/timezone, so it can't be computed
  // during the server render without risking a hydration mismatch against
  // whatever the client then computes a moment later.
  useEffect(() => {
    if (visitDateRef.current && !visitDateRef.current.value) {
      visitDateRef.current.value = nowForDateTimeInput();
    }
  }, []);

  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      <div className="space-y-2">
        <Label htmlFor="visitDate">Fecha de la consulta</Label>
        <Input id="visitDate" name="visitDate" type="datetime-local" ref={visitDateRef} disabled={pending} />
        <p className="text-xs text-muted-foreground">
          Se rellena con la fecha y hora actuales — edítala si la consulta fue en otro momento.
        </p>
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
