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
import { deleteClinicalEntryAction, discardClinicalEntryDraftAction } from "@/lib/actions/clinical-entries";

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
  isDraft = false,
  canDiscard = false,
}: {
  patientId: string;
  entryId: string;
  canDelete: boolean;
  // Un borrador no se "elimina" como una consulta firmada: se descarta (borrado
  // real) y puede hacerlo su autor o un administrador (canDiscard).
  isDraft?: boolean;
  canDiscard?: boolean;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
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
          {isDraft && canDiscard && (
            <DropdownMenuItem
              className="text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
              onSelect={() => setDeleteOpen(true)}
            >
              <TrashIcon data-icon="inline-start" />
              Descartar borrador
            </DropdownMenuItem>
          )}
          {!isDraft && canDelete && (
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
            <DialogTitle>{isDraft ? "¿Descartar este borrador?" : "¿Eliminar esta consulta?"}</DialogTitle>
            <DialogDescription>
              {isDraft
                ? "Se borra por completo y no se puede recuperar. Un borrador no forma parte de la historia clínica."
                : "Desaparece de la ficha del paciente. Pensado para corregir un error (paciente equivocado, duplicado de una importación) — una corrección normal se edita o se registra como una consulta nueva, no borrando la anterior."}
            </DialogDescription>
          </DialogHeader>
          {discardError && <p className="text-sm text-destructive">{discardError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={pending}>
              Volver
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  if (isDraft) {
                    const result = await discardClinicalEntryDraftAction(patientId, entryId);
                    if (result.error) setDiscardError(result.error);
                    else setDeleteOpen(false);
                    return;
                  }
                  await deleteClinicalEntryAction(patientId, entryId);
                })
              }
            >
              {pending ? (isDraft ? "Descartando..." : "Eliminando...") : isDraft ? "Descartar borrador" : "Confirmar eliminación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
