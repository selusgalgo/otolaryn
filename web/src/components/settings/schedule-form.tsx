"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { ScheduleFormState } from "@/lib/actions/settings";

const WEEKDAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

interface ScheduleFormProps {
  action: (prevState: ScheduleFormState, formData: FormData) => Promise<ScheduleFormState>;
  initialOpenDays: boolean[];
}

const initialState: ScheduleFormState = {};

export function ScheduleForm({ action, initialOpenDays }: ScheduleFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [openDays, setOpenDays] = useState(initialOpenDays);

  function toggle(index: number, checked: boolean) {
    setOpenDays((prev) => prev.map((v, i) => (i === index ? checked : v)));
  }

  return (
    <form action={formAction} className="grid max-w-sm gap-4">
      <div className="space-y-2">
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <Checkbox
              id={`day-${i}`}
              checked={openDays[i]}
              onCheckedChange={(checked) => toggle(i, checked === true)}
              disabled={pending}
            />
            {/* Mirrors the Checkbox's own state — the Server Action reads
                these, not Radix's internal form participation, so
                submission doesn't depend on that behaving a particular way. */}
            <input type="hidden" name={`day${i}`} value={openDays[i] ? "true" : "false"} />
            <Label htmlFor={`day-${i}`} className="font-normal">
              {label}
            </Label>
          </div>
        ))}
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-success">Horario guardado.</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Guardando..." : "Guardar horario"}
      </Button>
    </form>
  );
}
