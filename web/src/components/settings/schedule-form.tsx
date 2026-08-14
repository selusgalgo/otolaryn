"use client";

import { useActionState, useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { ScheduleFormState } from "@/lib/actions/settings";
import type { DaySchedule, TimeSlot } from "@/lib/types";

const WEEKDAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const DEFAULT_SLOT: TimeSlot = { startTime: "09:00", endTime: "18:00" };

interface ScheduleFormProps {
  action: (prevState: ScheduleFormState, formData: FormData) => Promise<ScheduleFormState>;
  initialDays: DaySchedule[];
}

const initialState: ScheduleFormState = {};

export function ScheduleForm({ action, initialDays }: ScheduleFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [days, setDays] = useState(initialDays);

  function toggleDay(index: number, open: boolean) {
    setDays((prev) =>
      prev.map((day, i) =>
        i === index ? { ...day, slots: open ? [DEFAULT_SLOT] : [] } : day,
      ),
    );
  }

  function addSlot(index: number) {
    setDays((prev) =>
      prev.map((day, i) => (i === index ? { ...day, slots: [...day.slots, DEFAULT_SLOT] } : day)),
    );
  }

  function removeSlot(dayIndex: number, slotIndex: number) {
    setDays((prev) =>
      prev.map((day, i) =>
        i === dayIndex ? { ...day, slots: day.slots.filter((_, s) => s !== slotIndex) } : day,
      ),
    );
  }

  function updateSlot(dayIndex: number, slotIndex: number, field: keyof TimeSlot, value: string) {
    setDays((prev) =>
      prev.map((day, i) =>
        i === dayIndex
          ? {
              ...day,
              slots: day.slots.map((slot, s) => (s === slotIndex ? { ...slot, [field]: value } : slot)),
            }
          : day,
      ),
    );
  }

  return (
    <form action={formAction} className="grid max-w-md gap-4">
      <div className="space-y-4">
        {days.map((day, dayIndex) => {
          const open = day.slots.length > 0;
          return (
            <div key={day.weekday} className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`day-${day.weekday}`}
                  checked={open}
                  onCheckedChange={(checked) => toggleDay(dayIndex, checked === true)}
                  disabled={pending}
                />
                <Label htmlFor={`day-${day.weekday}`} className="font-normal">
                  {WEEKDAY_LABELS[day.weekday]}
                </Label>
              </div>
              {open && (
                <div className="ml-6 space-y-2">
                  {day.slots.map((slot, slotIndex) => (
                    <div key={slotIndex} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={slot.startTime}
                        onChange={(e) => updateSlot(dayIndex, slotIndex, "startTime", e.target.value)}
                        disabled={pending}
                        className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm disabled:opacity-50"
                      />
                      <span className="text-sm text-muted-foreground">a</span>
                      <input
                        type="time"
                        value={slot.endTime}
                        onChange={(e) => updateSlot(dayIndex, slotIndex, "endTime", e.target.value)}
                        disabled={pending}
                        className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => removeSlot(dayIndex, slotIndex)}
                        disabled={pending}
                        aria-label="Quitar tramo"
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                      >
                        <XIcon className="size-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addSlot(dayIndex)}
                    disabled={pending}
                    className="flex items-center gap-1 text-sm text-primary hover:underline disabled:opacity-50"
                  >
                    <PlusIcon className="size-4" />
                    Añadir tramo
                  </button>
                </div>
              )}
              {/* The Server Action reads this, not the Checkbox/inputs above
                  directly — same "state mirrored into a hidden input" pattern
                  as the rest of this form, needed because a variable number
                  of tramos per day doesn't map to fixed field names. */}
              <input type="hidden" name={`day${day.weekday}`} value={JSON.stringify(day.slots)} />
            </div>
          );
        })}
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-success">Horario guardado.</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Guardando..." : "Guardar horario"}
      </Button>
    </form>
  );
}
