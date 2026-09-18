"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { APPOINTMENT_STATUSES, APPOINTMENT_STATUS_LABELS } from "@/lib/appointment-status";
import { getNextFreeSlotsAction } from "@/lib/actions/appointments";
import type { AppointmentFormState } from "@/lib/actions/appointments";
import type { PractitionerOption } from "@/lib/practitioners";
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
  // null (or omitted): profesional role — the backend auto-assigns the
  // appointment to the caller, so there's nothing to pick and the field is
  // hidden. A non-null array (possibly empty): admin/recepcion, who must
  // pick a profesional explicitly — see getPractitionerOptions().
  practitioners?: PractitionerOption[] | null;
  // Pre-fills the date field (YYYY-MM-DD) when there's no initialValues yet
  // — Escritorio's calendar passes the day currently selected. Ignored once
  // initialValues is set (editing always wins).
  defaultDate?: string;
  // Pre-fills the time field (HH:MM) — Agenda's "horas disponibles" popover
  // passes the exact slot clicked. Same initialValues precedence as
  // defaultDate.
  defaultTime?: string;
  // Pre-selects the Profesional field — Agenda's calendar passes whichever
  // profesional its own filter is scoped to, so a slot picked from that
  // profesional's free-hours popover arrives with them already chosen.
  defaultPractitionerId?: string;
  // Shows a row of the next 5 free slots (see getNextFreeSlotsAction),
  // clicking one fills in Fecha/Hora — only makes sense for a new
  // appointment, never while editing (initialValues set) even if a caller
  // passes true. For admin/recepcion (practitioners != null) these are
  // specific to one profesional, so nothing is fetched until one is
  // chosen — two different profesionales' free hours are two different
  // answers, never a combined "anyone's free" list a person could safely
  // click without then also picking who it's actually free for.
  suggestSlots?: boolean;
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

function formatSlotLabel(iso: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
  const timePart = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return `${datePart} · ${timePart}`;
}

export function AppointmentForm({
  action,
  initialValues,
  submitLabel,
  submitIcon,
  showStatus,
  practitioners,
  defaultDate,
  defaultTime,
  defaultPractitionerId,
  suggestSlots,
  children,
  onSuccess,
}: AppointmentFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);

  // Controlled (not defaultValue): admin/recepcion's suggestions below need
  // to know which profesional is picked *right now* to fetch that specific
  // person's free hours, not just whatever was there on mount.
  const [practitionerId, setPractitionerId] = useState(
    initialValues?.practitionerId ?? defaultPractitionerId ?? "",
  );
  // admin/recepcion see one profesional's schedule at a time here — a
  // profesional (practitioners == null) has no picker at all and is
  // already scoped to themselves server-side, so this gate never applies
  // to them.
  const needsPractitionerFirst = practitioners != null;

  const showSuggestions = suggestSlots && !initialValues;
  const canFetchSuggestions = showSuggestions && (!needsPractitionerFirst || practitionerId !== "");
  const [suggestedSlots, setSuggestedSlots] = useState<string[] | null>(null);

  useEffect(() => {
    if (state.success) onSuccess?.();
  }, [state.success, onSuccess]);

  useEffect(() => {
    if (!canFetchSuggestions) return;
    let cancelled = false;
    setSuggestedSlots(null);
    getNextFreeSlotsAction(defaultDate, 5, practitionerId || undefined).then((slots) => {
      if (!cancelled) setSuggestedSlots(slots);
    });
    return () => {
      cancelled = true;
    };
    // defaultDate anchors the search (e.g. Escritorio's selected day) and
    // practitionerId scopes it — re-fetch whenever either changes so the
    // suggestions stay relevant to whichever day/profesional is selected.
  }, [canFetchSuggestions, defaultDate, practitionerId]);

  function applySlot(iso: string) {
    if (dateInputRef.current) dateInputRef.current.value = toDateInputValue(iso);
    if (timeInputRef.current) timeInputRef.current.value = toTimeInputValue(iso);
  }

  return (
    <form action={formAction} className="grid max-w-md gap-4">
      {children}
      {/* Antes de las horas libres, no después: para admin/recepcion, qué
          horas están libres depende de qué profesional se elige — sin
          escogerlo primero no hay una respuesta única que ofrecer. */}
      {practitioners != null && (
        <div className="space-y-2">
          <Label htmlFor="practitionerId">Profesional</Label>
          <select
            id="practitionerId"
            name="practitionerId"
            required
            value={practitionerId}
            onChange={(e) => setPractitionerId(e.target.value)}
            disabled={pending}
            className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50"
          >
            <option value="" disabled>
              Selecciona un profesional
            </option>
            {practitioners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {showSuggestions && (
        <div className="space-y-2">
          <Label>Próximos horarios libres</Label>
          {needsPractitionerFirst && practitionerId === "" ? (
            <p className="text-sm text-muted-foreground">
              Selecciona un profesional para ver sus horarios libres.
            </p>
          ) : suggestedSlots === null ? (
            <p className="text-sm text-muted-foreground">Buscando horarios libres…</p>
          ) : suggestedSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No se encontraron horarios libres en las próximas dos semanas.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {suggestedSlots.map((iso) => (
                <button
                  key={iso}
                  type="button"
                  onClick={() => applySlot(iso)}
                  disabled={pending}
                  className="rounded-full border px-3 py-1 text-xs transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {formatSlotLabel(iso)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="date">Fecha</Label>
          <Input
            ref={dateInputRef}
            id="date"
            name="date"
            type="date"
            defaultValue={initialValues ? toDateInputValue(initialValues.scheduledAt) : defaultDate}
            required
            disabled={pending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="time">Hora</Label>
          <Input
            ref={timeInputRef}
            id="time"
            name="time"
            type="time"
            defaultValue={initialValues ? toTimeInputValue(initialValues.scheduledAt) : defaultTime}
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
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50"
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
