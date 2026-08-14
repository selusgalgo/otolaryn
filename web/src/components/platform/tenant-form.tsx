"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TenantFormState } from "@/lib/actions/platform";

interface TenantFormProps {
  action: (prevState: TenantFormState, formData: FormData) => Promise<TenantFormState>;
  submitLabel: string;
  submitIcon?: React.ReactNode;
  onSuccess?: () => void;
}

const initialState: TenantFormState = {};

export function TenantForm({ action, submitLabel, submitIcon, onSuccess }: TenantFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.success) onSuccess?.();
  }, [state.success, onSuccess]);

  return (
    <form action={formAction} className="grid max-w-lg gap-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre de la clínica</Label>
        <Input id="name" name="name" required disabled={pending} />
      </div>
      {/* Every clinic needs a working login from the moment it exists — a
          tenant with no admin would be a dead end nobody could enter, so
          this form creates both in one step. */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="adminFirstName">Nombre del admin</Label>
          <Input id="adminFirstName" name="adminFirstName" required disabled={pending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="adminLastName">Apellidos del admin</Label>
          <Input id="adminLastName" name="adminLastName" required disabled={pending} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="adminEmail">Email del admin</Label>
        <Input id="adminEmail" name="adminEmail" type="email" required disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="adminPassword">Contraseña inicial del admin</Label>
        <Input id="adminPassword" name="adminPassword" type="password" minLength={8} required disabled={pending} />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? (
          "Guardando..."
        ) : (
          <>
            {submitIcon}
            {submitLabel}
          </>
        )}
      </Button>
    </form>
  );
}
