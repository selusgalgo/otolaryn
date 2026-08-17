"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import { createAppointmentAction } from "@/lib/actions/appointments";
import type { PractitionerOption } from "@/lib/practitioners";

export function CreateAppointmentDialog({
  patientId,
  practitioners,
}: {
  patientId: string;
  practitioners?: PractitionerOption[] | null;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = createAppointmentAction.bind(null, patientId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
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
          suggestSlots
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
