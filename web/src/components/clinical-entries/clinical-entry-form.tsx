"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Textarea } from "@/components/ui/textarea";
import type { ClinicalEntryFormState } from "@/lib/actions/clinical-entries";
import type { ClinicalEntry } from "@/lib/types";

interface ClinicalEntryFormProps {
  action: (prevState: ClinicalEntryFormState, formData: FormData) => Promise<ClinicalEntryFormState>;
  // Presente = modo edición (PATCH, ver EditClinicalEntryDialog); ausente
  // = modo creación, igual que antes.
  initialValues?: ClinicalEntry;
  submitLabel?: string;
  // Llamado tras un guardado correcto — lo usa el diálogo de edición para
  // cerrarse solo, igual que AppointmentForm.
  onSuccess?: () => void;
}

const initialState: ClinicalEntryFormState = {};

// "YYYY-MM-DDTHH:MM" en la hora local del navegador, lo que pide un input
// datetime-local. Con getters locales, no toISOString() (esa es UTC) — así
// la fecha se lee en la hora de pared del profesional, no la del servidor.
function toDateTimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ClinicalEntryForm({
  action,
  initialValues,
  submitLabel = "Guardar entrada",
  onSuccess,
}: ClinicalEntryFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const visitDateRef = useRef<HTMLInputElement>(null);
  const [chiefComplaint, setChiefComplaint] = useState(initialValues?.chiefComplaint ?? "");
  const [examinationFindings, setExaminationFindings] = useState(
    initialValues?.examinationFindings ?? "",
  );
  const [treatment, setTreatment] = useState(initialValues?.treatment ?? "");

  useEffect(() => {
    if (state.success) onSuccess?.();
  }, [state.success, onSuccess]);

  // Set imperatively after mount, not via defaultValue: both "now" and
  // the clinic-local reading of initialValues.visitDate only mean
  // anything in the browser's own clock/timezone, so neither can be
  // computed during the server render without risking a hydration
  // mismatch against whatever the client then computes a moment later.
  useEffect(() => {
    if (visitDateRef.current && !visitDateRef.current.value) {
      visitDateRef.current.value = toDateTimeInputValue(
        initialValues ? new Date(initialValues.visitDate) : new Date(),
      );
    }
  }, [initialValues]);

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
        <Label>Motivo de consulta</Label>
        <input type="hidden" name="chiefComplaint" value={chiefComplaint} />
        <RichTextEditor value={chiefComplaint} onChange={setChiefComplaint} disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label>Exploración</Label>
        <input type="hidden" name="examinationFindings" value={examinationFindings} />
        <RichTextEditor value={examinationFindings} onChange={setExaminationFindings} disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="diagnosis">Diagnóstico</Label>
        <Textarea
          id="diagnosis"
          name="diagnosis"
          defaultValue={initialValues?.diagnosis ?? ""}
          disabled={pending}
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label>Tratamiento</Label>
        <input type="hidden" name="treatment" value={treatment} />
        <RichTextEditor value={treatment} onChange={setTreatment} disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="followUpNotes">Notas de seguimiento</Label>
        <Textarea
          id="followUpNotes"
          name="followUpNotes"
          defaultValue={initialValues?.followUpNotes ?? ""}
          disabled={pending}
          rows={2}
        />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Guardando..." : submitLabel}
      </Button>
    </form>
  );
}
