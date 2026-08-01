"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { APPOINTMENT_STATUSES, APPOINTMENT_STATUS_LABELS } from "@/lib/appointment-status";
import type { AppointmentFormState } from "@/lib/actions/appointments";
import type { Appointment } from "@/lib/types";

interface AppointmentFormProps {
  action: (prevState: AppointmentFormState, formData: FormData) => Promise<AppointmentFormState>;
  initialValues?: Appointment;
  submitLabel: string;
  // Pre-rendered JSX, not a component reference — this form can be used
  // from a Server Component page (e.g. /appointments/new), and only plain
  // React elements survive that server-to-client props boundary, not
  // function/forwardRef values like a bare icon component.
  submitIcon?: React.ReactNode;
  // Status is only editable once an appointment exists — a new one always
  // starts as "scheduled" (the backend doesn't even accept status on create).
  showStatus?: boolean;
  // Rendered above the date/time fields — used by /appointments/new to
  // embed <PatientPicker /> inside this same <form> so patient selection
  // (or inline creation) and the appointment details submit together.
  children?: React.ReactNode;
  // Called after a successful submit — used by the dialog wrappers to
  // close themselves, since those actions revalidate instead of redirecting.
  onSuccess?: () => void;
}

const initialState: AppointmentFormState = {};

// Uses local getters, not toISOString() — the create/update actions parse
// "<date>T<time>" as local time (that's how the browser's native
// date/time inputs work), so pre-filling from the UTC-formatted
// toISOString() would show a shifted time in any timezone away from UTC.
function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toTimeInputValue(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function AppointmentForm({
  action,
  initialValues,
  submitLabel,
  submitIcon,
  showStatus,
  children,
  onSuccess,
}: AppointmentFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.success) onSuccess?.();
  }, [state.success, onSuccess]);

  return (
    <form action={formAction} className="grid max-w-md gap-4">
      {children}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="date">Fecha</Label>
          <Input
            id="date"
            name="date"
            type="date"
            defaultValue={initialValues ? toDateInputValue(initialValues.scheduledAt) : undefined}
            required
            disabled={pending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="time">Hora</Label>
          <Input
            id="time"
            name="time"
            type="time"
            defaultValue={initialValues ? toTimeInputValue(initialValues.scheduledAt) : undefined}
            required
            disabled={pending}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="durationMinutes">Duración (minutos)</Label>
        <Input
          id="durationMinutes"
          name="durationMinutes"
          type="number"
          min={5}
          max={480}
          step={5}
          defaultValue={initialValues?.durationMinutes ?? 30}
          disabled={pending}
        />
      </div>
      {showStatus && (
        <div className="space-y-2">
          <Label htmlFor="status">Estado</Label>
          <select
            id="status"
            name="status"
            defaultValue={initialValues?.status}
            disabled={pending}
            className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm disabled:opacity-50"
          >
            {APPOINTMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {APPOINTMENT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" name="notes" defaultValue={initialValues?.notes ?? ""} disabled={pending} rows={2} />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? (
          "Guardando..."
        ) : (
          <>
            {submitIcon}
            {submitLabel}
          </>
        )}
      </Button>
    </form>
  );
}
