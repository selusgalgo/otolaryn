"use client";

import { useState, useTransition } from "react";
import { EllipsisVerticalIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteClinicalEntryAction } from "@/lib/actions/clinical-entries";

// El botón de tres puntos se mantiene en todas las filas (sitio para
// futuras acciones), pero "Eliminar" solo hace algo para admin — para
// cualquier otro rol el menú se abre vacío en vez de desaparecer el
// control entero, así la fila no "salta" de ancho según el rol. Mismo
// patrón "el diálogo vive fuera del DropdownMenuContent" que
// AppointmentRowActions, para que siga abierto tras cerrarse el menú.
export function ClinicalEntryRowActions({
  patientId,
  entryId,
  canDelete,
}: {
  patientId: string;
  entryId: string;
  canDelete: boolean;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Más acciones para esta consulta">
            <EllipsisVerticalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canDelete && (
            <DropdownMenuItem
              className="text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
              onSelect={() => setDeleteOpen(true)}
            >
              <TrashIcon data-icon="inline-start" />
              Eliminar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar esta consulta?</DialogTitle>
            <DialogDescription>
              Desaparece de la ficha del paciente. Pensado para corregir un error (paciente equivocado,
              duplicado de una importación) — una corrección normal se edita o se registra como una
              consulta nueva, no borrando la anterior.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={pending}>
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
    </>
  );
}
