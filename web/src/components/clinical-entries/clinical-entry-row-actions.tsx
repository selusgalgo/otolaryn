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
} from "@/components/ui/dialog";
import { RowActions } from "@/components/ui/row-actions";
import { deleteClinicalEntryAction, discardClinicalEntryDraftAction } from "@/lib/actions/clinical-entries";

// La acción disponible aparece como icono directo; el diálogo permanece
// fuera de RowActions para conservar su estado al activar la acción.
// "Eliminar" solo hace algo para admin — para cualquier otro rol la fila
// conserva el espacio reservado y no muestra un botón vacío.
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
      <RowActions
        overflowLabel="Más acciones para esta consulta"
        reserveSpaceWhenEmpty
        actions={
          (isDraft && canDiscard) || (!isDraft && canDelete)
            ? [
                {
                  id: isDraft ? "discard" : "delete",
                  label: isDraft ? "Descartar borrador" : "Eliminar consulta",
                  icon: <TrashIcon />,
                  onSelect: () => setDeleteOpen(true),
                  destructive: true,
                },
              ]
            : []
        }
      />

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
