"use client";

import { useState, useTransition } from "react";
import { EllipsisVerticalIcon, PencilIcon, TrashIcon, XCircleIcon } from "@heroicons/react/24/outline";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import {
  cancelAppointmentAction,
  deleteAppointmentAction,
  updateAppointmentAction,
} from "@/lib/actions/appointments";
import type { PractitionerOption } from "@/lib/practitioners";
import type { Appointment } from "@/lib/types";

interface AppointmentRowActionsProps {
  appointment: Appointment;
  practitioners?: PractitionerOption[] | null;
  // admin/recepcion (el backend ya devuelve 403 a cualquier otro rol) —
  // ver AppointmentsController.remove.
  canDelete: boolean;
}

// Same "dialogs live outside DropdownMenuContent, as siblings" pattern as
// PatientRowActions — each dialog keeps its own open state independent of
// the menu, so it stays open after the menu itself closes on select.
export function AppointmentRowActions({ appointment, practitioners, canDelete }: AppointmentRowActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const boundUpdate = updateAppointmentAction.bind(null, appointment.id);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Acciones para esta cita">
            <EllipsisVerticalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <PencilIcon data-icon="inline-start" />
            Editar
          </DropdownMenuItem>
          {/* A cita ya cancelada no tiene nada más que cancelar. */}
          {appointment.status !== "cancelled" && (
            <DropdownMenuItem
              className="text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
              onSelect={() => setCancelOpen(true)}
            >
              <XCircleIcon data-icon="inline-start" />
              Cancelar cita
            </DropdownMenuItem>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
                onSelect={() => setDeleteOpen(true)}
              >
                <TrashIcon data-icon="inline-start" />
                Eliminar cita
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
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
            onSuccess={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cancelar esta cita?</DialogTitle>
            <DialogDescription>
              La cita pasa a estado &quot;Cancelada&quot; y libera el hueco en la agenda, pero sigue
              apareciendo en el historial.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={pending}>
              Volver
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => startTransition(() => cancelAppointmentAction(appointment.id))}
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
              Desaparece de la agenda. A diferencia de cancelar, no queda visible en el historial — para
              una cita que sí llegó a existir mejor cancelarla.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={pending}>
              Volver
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => startTransition(() => deleteAppointmentAction(appointment.id))}
            >
              {pending ? "Eliminando..." : "Confirmar eliminación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
