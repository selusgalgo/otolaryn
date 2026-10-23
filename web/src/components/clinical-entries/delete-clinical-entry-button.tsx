"use client";

import { useState, useTransition } from "react";
import { TrashIcon } from "@heroicons/react/24/outline";
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
import { deleteClinicalEntryAction } from "@/lib/actions/clinical-entries";

// Admin only (el backend ya devuelve 403 a cualquier otro rol) — ver
// ClinicalEntriesController.remove. Para "editar" una consulta ya
// registrada está EditClinicalEntryDialog (admin y profesional); esto es
// solo para quitar un error real (paciente equivocado, duplicado de una
// importación).
export function DeleteClinicalEntryButton({
  patientId,
  entryId,
}: {
  patientId: string;
  entryId: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <TrashIcon data-icon="inline-start" />
          Eliminar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar esta consulta?</DialogTitle>
          <DialogDescription>
            Desaparece de la ficha del paciente. Pensado para corregir un error (paciente equivocado,
            duplicado de una importación) — una corrección normal se registra como una consulta nueva, no
            borrando la anterior.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Volver
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => startTransition(() => deleteClinicalEntryAction(patientId, entryId))}
          >
            {pending ? "Eliminando..." : "Confirmar eliminación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
