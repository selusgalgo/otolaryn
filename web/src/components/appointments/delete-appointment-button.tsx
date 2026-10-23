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
import { deleteAppointmentAction } from "@/lib/actions/appointments";

// admin/recepcion only (el backend ya devuelve 403 a cualquier otro rol —
// ver AppointmentsController.remove). Distinto de CancelAppointmentButton:
// esto quita la cita de la agenda de verdad, no la deja como "Cancelada"
// en el histórico.
export function DeleteAppointmentButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Eliminar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar esta cita?</DialogTitle>
          <DialogDescription>
            Desaparece de la agenda. A diferencia de cancelar, no queda visible en el historial — para
            una cita que sí llegó a existir mejor cancelarla.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Volver
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => startTransition(() => deleteAppointmentAction(id))}
          >
            {pending ? "Eliminando..." : "Confirmar eliminación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
