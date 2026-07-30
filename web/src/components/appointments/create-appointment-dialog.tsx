"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import { createAppointmentAction } from "@/lib/actions/appointments";

export function CreateAppointmentDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const boundAction = createAppointmentAction.bind(null, patientId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Nueva cita</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva cita</DialogTitle>
        </DialogHeader>
        <AppointmentForm action={boundAction} submitLabel="Crear cita" onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
