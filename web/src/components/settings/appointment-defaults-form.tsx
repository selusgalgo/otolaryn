"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppointmentDefaultsFormState } from "@/lib/actions/settings";

interface AppointmentDefaultsFormProps {
  action: (
    prevState: AppointmentDefaultsFormState,
    formData: FormData,
  ) => Promise<AppointmentDefaultsFormState>;
  initialDefaultDurationMinutes: number;
}

const initialState: AppointmentDefaultsFormState = {};

// Same 5-480 bounds as the appointment form's own Duración field — this
// only changes what a new cita starts out with, never what's allowed.
export function AppointmentDefaultsForm({
  action,
  initialDefaultDurationMinutes,
}: AppointmentDefaultsFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid max-w-xs gap-4">
      <div className="space-y-2">
        <Label htmlFor="defaultDurationMinutes">Duración por defecto (minutos)</Label>
        <Input
          id="defaultDurationMinutes"
          name="defaultDurationMinutes"
          type="number"
          min={5}
          max={480}
          step={5}
          defaultValue={initialDefaultDurationMinutes}
          disabled={pending}
          required
        />
        <p className="text-xs text-muted-foreground">
          Con la que se precarga una cita nueva — se puede cambiar en el momento de crearla.
        </p>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-success">Guardado.</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
