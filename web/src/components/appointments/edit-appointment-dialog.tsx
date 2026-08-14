"use client";

import { useState } from "react";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import { updateAppointmentAction } from "@/lib/actions/appointments";
import type { PractitionerOption } from "@/lib/practitioners";
import type { Appointment } from "@/lib/types";

export function EditAppointmentDialog({
  appointment,
  practitioners,
}: {
  appointment: Appointment;
  practitioners?: PractitionerOption[] | null;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = updateAppointmentAction.bind(null, appointment.id);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PencilIcon data-icon="inline-start" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar cita</DialogTitle>
        </DialogHeader>
        <AppointmentForm
          action={boundAction}
          initialValues={appointment}
          submitLabel="Guardar cambios"
          showStatus
          practitioners={practitioners}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
