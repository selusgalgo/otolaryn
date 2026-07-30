"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cancelAppointmentAction } from "@/lib/actions/appointments";

export function CancelAppointmentButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Cancelar cita</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Cancelar esta cita?</DialogTitle>
          <DialogDescription>
            La cita pasa a estado &quot;Cancelada&quot; y libera el hueco en la agenda, pero sigue
            apareciendo en el historial.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Volver
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => startTransition(() => cancelAppointmentAction(id))}
          >
            {pending ? "Cancelando..." : "Confirmar cancelación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
