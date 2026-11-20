"use client";

import { useRef, useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import { createAppointmentAction } from "@/lib/actions/appointments";
import type { PractitionerOption } from "@/lib/practitioners";
import { confirmDiscardUnsavedChanges } from "@/lib/unsaved-changes";

export function CreateAppointmentDialog({
  patientId,
  patientName,
  practitioners,
}: {
  patientId: string;
  patientName?: string;
  practitioners?: PractitionerOption[] | null;
}) {
  const [open, setOpen] = useState(false);
  const dirtyRef = useRef(false);
  const boundAction = createAppointmentAction.bind(null, patientId);

  function handleOpenChange(next: boolean) {
    if (!next && !confirmDiscardUnsavedChanges(dirtyRef.current)) return;
    if (!next) dirtyRef.current = false;
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon data-icon="inline-start" />
          Nueva cita
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva cita</DialogTitle>
        </DialogHeader>
        <AppointmentForm
          action={boundAction}
          submitLabel="Crear cita"
          submitIcon={<PlusIcon data-icon="inline-start" />}
          practitioners={practitioners}
          confirmationPatientName={patientName}
          suggestSlots
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
