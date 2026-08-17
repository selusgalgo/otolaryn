"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import { PatientPicker } from "@/components/appointments/patient-picker";
import { createAppointmentFromAgendaAction } from "@/lib/actions/appointments";
import type { PractitionerOption } from "@/lib/practitioners";

// Agenda's "Nueva cita" button: a modal instead of a full navigation to
// /appointments/new, since staying on the Agenda list — which just
// revalidates in place once the cita is created — is a smaller jump than
// leaving the screen entirely. /appointments/new itself stays as a real
// page reachable directly by URL, but both Agenda's "Nueva cita" and
// Escritorio's "Crear" (which arrives with a day already picked from its
// calendar, via defaultDate) now go through this dialog instead.
export function NewAppointmentDialog({
  practitioners,
  defaultDate,
  triggerLabel = "Nueva cita",
  onCreated,
}: {
  practitioners?: PractitionerOption[] | null;
  // Pre-fills the date field — Escritorio passes the day selected on its
  // mini-calendar; Agenda leaves this unset and lets the user pick.
  defaultDate?: string;
  triggerLabel?: string;
  // Called after a successful create, in addition to closing the dialog —
  // Escritorio's calendar uses this to re-fetch the visible month so the
  // "Programado para" list picks up the new cita without a page reload
  // (the server-side revalidatePath alone doesn't reach into a client
  // component's own state).
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon data-icon="inline-start" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      {/* max-h + overflow-y: this form is taller than the other dialogs in
          the app (appointment fields + the full PatientPicker, including
          its inline new-patient fields) — tall enough to clip against the
          viewport on shorter screens without an explicit scroll area. */}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva cita</DialogTitle>
        </DialogHeader>
        <AppointmentForm
          action={createAppointmentFromAgendaAction}
          submitLabel="Crear cita"
          submitIcon={<PlusIcon data-icon="inline-start" />}
          practitioners={practitioners}
          defaultDate={defaultDate}
          suggestSlots
          onSuccess={() => {
            setOpen(false);
            onCreated?.();
          }}
        >
          <PatientPicker />
        </AppointmentForm>
      </DialogContent>
    </Dialog>
  );
}
