"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileAction, type ProfileFormState } from "@/lib/actions/account";
import type { AccountProfile } from "@/lib/types";

const initialState: ProfileFormState = {};

export function ProfileForm({ profile }: { profile: AccountProfile }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initialState);

  return (
    <form action={formAction} className="grid max-w-sm gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">Nombre</Label>
          <Input id="firstName" name="firstName" defaultValue={profile.firstName} required disabled={pending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Apellidos</Label>
          <Input id="lastName" name="lastName" defaultValue={profile.lastName} required disabled={pending} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="username">Nombre de usuario</Label>
        <Input
          id="username"
          name="username"
          defaultValue={profile.username ?? ""}
          placeholder="Opcional — para entrar sin usar el email"
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label>Email</Label>
        <p className="text-sm text-muted-foreground">{profile.email}</p>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-success">Cambios guardados.</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Guardando..." : "Guardar cambios"}
      </Button>
    </form>
  );
}
