"use client";

import { useRef, useState, useTransition } from "react";
import {
  PencilIcon,
  TrashIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import { RowActions } from "@/components/ui/row-actions";
import {
  cancelAppointmentAction,
  deleteAppointmentAction,
  updateAppointmentAction,
} from "@/lib/actions/appointments";
import type { PractitionerOption } from "@/lib/practitioners";
import type { Appointment } from "@/lib/types";
import { confirmDiscardUnsavedChanges } from "@/lib/unsaved-changes";

interface AppointmentRowActionsProps {
  appointment: Appointment;
  patientName?: string;
  practitioners?: PractitionerOption[] | null;
  // admin/recepcion (el backend ya devuelve 403 a cualquier otro rol) —
  // ver AppointmentsController.remove.
  canDelete: boolean;
}

// Same "dialogs live outside DropdownMenuContent, as siblings" pattern as
// PatientRowActions — each dialog keeps its own open state independent of
// the menu, so it stays open after the menu itself closes on select.
export function AppointmentRowActions({
  appointment,
  patientName,
  practitioners,
  canDelete,
}: AppointmentRowActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const editDirtyRef = useRef(false);
  const [pending, startTransition] = useTransition();
  const boundUpdate = updateAppointmentAction.bind(null, appointment.id);

  function handleEditOpenChange(next: boolean) {
    if (!next && !confirmDiscardUnsavedChanges(editDirtyRef.current)) return;
    if (!next) editDirtyRef.current = false;
    setEditOpen(next);
  }

  return (
    <>
      <RowActions
        overflowLabel="Más acciones para esta cita"
        actions={[
          {
            id: "edit",
            label: "Editar cita",
            icon: <PencilIcon />,
            onSelect: () => setEditOpen(true),
          },
          ...(appointment.status !== "cancelled"
            ? [
                {
                  id: "cancel",
                  label: "Cancelar cita",
                  icon: <XCircleIcon />,
                  onSelect: () => setCancelOpen(true),
                  destructive: true,
                },
              ]
            : []),
          ...(canDelete
            ? [
                {
                  id: "delete",
                  label: "Eliminar cita",
                  icon: <TrashIcon />,
                  onSelect: () => setDeleteOpen(true),
                  destructive: true,
                },
              ]
            : []),
        ]}
      />

      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar cita</DialogTitle>
          </DialogHeader>
          <AppointmentForm
            action={boundUpdate}
            initialValues={appointment}
            submitLabel="Guardar cambios"
            showStatus
            practitioners={practitioners}
            confirmationPatientName={patientName}
            onDirtyChange={(dirty) => {
              editDirtyRef.current = dirty;
            }}
            onSuccess={() => {
              editDirtyRef.current = false;
              setEditOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cancelar esta cita?</DialogTitle>
            <DialogDescription>
              La cita pasa a estado &quot;Cancelada&quot; y libera el hueco en
              la agenda, pero sigue apareciendo en el historial.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelOpen(false)}
              disabled={pending}
            >
              Volver
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(() => cancelAppointmentAction(appointment.id))
              }
            >
              {pending ? "Cancelando..." : "Confirmar cancelación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar esta cita?</DialogTitle>
            <DialogDescription>
              Desaparece de la agenda. A diferencia de cancelar, no queda
              visible en el historial — para una cita que sí llegó a existir
              mejor cancelarla.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={pending}
            >
              Volver
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(() => deleteAppointmentAction(appointment.id))
              }
            >
              {pending ? "Eliminando..." : "Confirmar eliminación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
