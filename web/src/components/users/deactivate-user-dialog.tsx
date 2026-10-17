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

interface DeactivateUserDialogProps {
  user: AppUser;
  deactivateAction: () => Promise<{ error?: string }>;
  // Opened from the row's ⋮ menu (see UserRowActions) rather than its own
  // trigger button.
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Unlike DeleteUserDialog, this is fully reversible (the row menu offers
// "Reactivar" the moment this succeeds) — still worth a confirm step since
// it kicks the person out immediately (see JwtStrategy's active check), not
// just blocks future logins.
export function DeactivateUserDialog({
  user,
  deactivateAction,
  open,
  onOpenChange,
}: DeactivateUserDialogProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirmDeactivate() {
    setError(null);
    startTransition(async () => {
      const state = await deactivateAction();
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
            ¿Desactivar a {user.firstName} {user.lastName}?
          </DialogTitle>
          <DialogDescription>
            Perderá acceso a la plataforma de inmediato. Sus citas e historia clínica se
            mantienen tal cual — puedes reactivarle en cualquier momento.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={pending} onClick={confirmDeactivate}>
            {pending ? "Desactivando..." : "Desactivar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
