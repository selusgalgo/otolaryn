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
import { deletePatientAction } from "@/lib/actions/patients";

export function DeletePatientButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Dar de baja</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Dar de baja a este paciente?</DialogTitle>
          <DialogDescription>
            El paciente dejará de aparecer en listados y búsquedas, pero su historial no se elimina.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={pending} onClick={() => startTransition(() => deletePatientAction(id))}>
            {pending ? "Eliminando..." : "Confirmar baja"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
