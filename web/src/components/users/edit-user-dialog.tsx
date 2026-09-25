"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PencilIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UserFormState } from "@/lib/actions/users";
import { ASSIGNABLE_ROLES, ROLE_LABELS, STAFF_FUNCTIONS, STAFF_FUNCTION_LABELS } from "@/lib/roles";
import type { AppUser } from "@/lib/types";

const initialState: UserFormState = {};

interface EditUserDialogProps {
  user: AppUser;
  updateAction: (prevState: UserFormState, formData: FormData) => Promise<UserFormState>;
  resetPasswordAction: (prevState: UserFormState, formData: FormData) => Promise<UserFormState>;
}

// Two independent forms in one dialog — editing a user's data and
// resetting their password are separate actions with separate success/
// error states, same as Mi cuenta's own Perfil/Contraseña split, just
// side by side here instead of on their own page. No "current password"
// field on the reset side: this is admin/superadmin setting a new one
// directly (e.g. because the owner is locked out), not the account
// holder changing their own.
export function EditUserDialog({ user, updateAction, resetPasswordAction }: EditUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string>(user.role);
  const [staffFunction, setStaffFunction] = useState<string>(user.staffFunction ?? "");
  const [dataState, dataFormAction, dataPending] = useActionState(updateAction, initialState);
  const [passwordState, passwordFormAction, passwordPending] = useActionState(
    resetPasswordAction,
    initialState,
  );
  const passwordFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (passwordState.success) passwordFormRef.current?.reset();
  }, [passwordState.success]);

  // React's <form action={...}> resets the DOM of every named form control
  // back to its initial state right after a successful action — for the
  // plain text inputs below that's invisible (defaultValue already matches
  // what's there), but for these two <select>s it snaps the *raw DOM* back
  // to their first option, out from under React's own state, which never
  // actually changed. Left alone, a second "Guardar cambios" click (no
  // edits, just re-confirming) would then read that stale reset DOM via
  // FormData and silently blank staffFunction — confirmed by reproducing it
  // against the real API. Forcing a fresh `key` on every action result
  // remounts both selects, which reapplies `value={role}`/`value=
  // {staffFunction}` from React's (still-correct) state and erases the
  // stray DOM reset before anyone can click again.
  const [saveCount, setSaveCount] = useState(0);
  useEffect(() => {
    setSaveCount((c) => c + 1);
  }, [dataState]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PencilIcon data-icon="inline-start" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Editar {user.firstName} {user.lastName}
          </DialogTitle>
        </DialogHeader>

        <form action={dataFormAction} className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="editFirstName">Nombre</Label>
              <Input
                id="editFirstName"
                name="firstName"
                defaultValue={user.firstName}
                required
                disabled={dataPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editLastName">Apellidos</Label>
              <Input
                id="editLastName"
                name="lastName"
                defaultValue={user.lastName}
                required
                disabled={dataPending}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="editUsername">Nombre de usuario</Label>
            <Input
              id="editUsername"
              name="username"
              defaultValue={user.username ?? ""}
              disabled={dataPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="editRole">Rol</Label>
            <select
              key={`role-${saveCount}`}
              id="editRole"
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={dataPending}
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50"
            >
              {ASSIGNABLE_ROLES.map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          {role === "admin" && (
            <div className="space-y-2">
              <Label htmlFor="editStaffFunction">Función adicional</Label>
              <select
                key={`staff-${saveCount}`}
                id="editStaffFunction"
                name="staffFunction"
                value={staffFunction}
                onChange={(e) => setStaffFunction(e.target.value)}
                disabled={dataPending}
                className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50"
              >
                <option value="">Solo administrador</option>
                {STAFF_FUNCTIONS.map((value) => (
                  <option key={value} value={value}>
                    {STAFF_FUNCTION_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          )}
          {dataState.error && <p className="text-sm text-destructive">{dataState.error}</p>}
          {dataState.success && <p className="text-sm text-success">Datos actualizados.</p>}
          <Button type="submit" disabled={dataPending} className="w-fit">
            {dataPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </form>

        <div className="border-t pt-4">
          <h3 className="mb-3 text-sm font-medium">Restablecer contraseña</h3>
          <form ref={passwordFormRef} action={passwordFormAction} className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">Contraseña nueva</Label>
                <Input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={passwordPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={passwordPending}
                />
              </div>
            </div>
            {passwordState.error && (
              <p className="text-sm text-destructive">{passwordState.error}</p>
            )}
            {passwordState.success && (
              <p className="text-sm text-success">Contraseña restablecida.</p>
            )}
            <Button type="submit" variant="outline" disabled={passwordPending} className="w-fit">
              {passwordPending ? "Restableciendo..." : "Restablecer contraseña"}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
