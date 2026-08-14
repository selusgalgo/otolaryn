"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePasswordAction, type PasswordFormState } from "@/lib/actions/account";

const initialState: PasswordFormState = {};

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(updatePasswordAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="grid max-w-sm gap-4">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">Contraseña actual</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">Contraseña nueva</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirmar contraseña nueva</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          disabled={pending}
        />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-success">Contraseña actualizada.</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Guardando..." : "Cambiar contraseña"}
      </Button>
    </form>
  );
}
