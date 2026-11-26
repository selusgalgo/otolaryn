"use client";

import { useRef, useState } from "react";
import { PencilIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import { updateAppointmentAction } from "@/lib/actions/appointments";
import type { PractitionerOption } from "@/lib/practitioners";
import type { Appointment } from "@/lib/types";
import { confirmDiscardUnsavedChanges } from "@/lib/unsaved-changes";

export function EditAppointmentDialog({
  appointment,
  patientName,
  practitioners,
}: {
  appointment: Appointment;
  patientName?: string;
  practitioners?: PractitionerOption[] | null;
}) {
  const [open, setOpen] = useState(false);
  const dirtyRef = useRef(false);
  const boundAction = updateAppointmentAction.bind(null, appointment.id);

  function handleOpenChange(next: boolean) {
    if (!next && !confirmDiscardUnsavedChanges(dirtyRef.current)) return;
    if (!next) dirtyRef.current = false;
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
          confirmationPatientName={patientName}
          onDirtyChange={(dirty) => {
            dirtyRef.current = dirty;
          }}
          onSuccess={() => {
            dirtyRef.current = false;
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
