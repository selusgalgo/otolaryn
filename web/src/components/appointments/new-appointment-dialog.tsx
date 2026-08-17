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
// page for Escritorio's "Crear" (arrives with a date already picked from
// that calendar), so this doesn't replace it, just adds a second entry
// point for Agenda specifically.
export function NewAppointmentDialog({ practitioners }: { practitioners?: PractitionerOption[] | null }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon data-icon="inline-start" />
          Nueva cita
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
          onSuccess={() => setOpen(false)}
        >
          <PatientPicker />
        </AppointmentForm>
      </DialogContent>
    </Dialog>
  );
}
