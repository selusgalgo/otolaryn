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
} from "@/components/ui/dialog";
import type { AppUser } from "@/lib/types";

interface DeleteUserDialogProps {
  user: AppUser;
  deleteAction: () => Promise<{ error?: string }>;
  // Opened from the row's ⋮ menu (see UserRowActions) rather than its own
  // trigger button.
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Hard delete, unlike Pacientes' "dar de baja" — an account is not a
// clinical record worth keeping around once someone leaves, so there's no
// soft-delete/reactivate path here to mirror. The backend itself refuses
// to delete your own account, the clinic's last admin, or anyone with
// appointments/clinical entries already tied to them — those errors show
// up here as-is, already written for the person reading them.
export function DeleteUserDialog({ user, deleteAction, open, onOpenChange }: DeleteUserDialogProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const state = await deleteAction();
      if (state.error) {
        setError(state.error);
        return;
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setError(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            ¿Eliminar a {user.firstName} {user.lastName}?
          </DialogTitle>
          <DialogDescription>
            Esta acción no se puede deshacer. La persona perderá acceso a la plataforma de
            inmediato.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={pending} onClick={confirmDelete}>
            {pending ? "Eliminando..." : "Eliminar usuario"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
