"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UserFormState } from "@/lib/actions/users";
import {
  ASSIGNABLE_ROLES,
  HONORIFIC_LABELS,
  HONORIFICS,
  practicesMedicine,
  ROLE_LABELS,
  STAFF_FUNCTIONS,
  STAFF_FUNCTION_LABELS,
} from "@/lib/roles";
import { keepValuesOnSubmit } from "@/lib/form-submit";

interface UserFormProps {
  action: (prevState: UserFormState, formData: FormData) => Promise<UserFormState>;
  submitLabel: string;
  submitIcon?: React.ReactNode;
  onSuccess?: () => void;
}

const initialState: UserFormState = {};

export function UserForm({ action, submitLabel, submitIcon, onSuccess }: UserFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [role, setRole] = useState<string>("profesional");
  // Controlado (no solo defaultValue) porque el desplegable de tratamiento de
  // más abajo depende de si el administrador ejerce además como médico.
  const [staffFunction, setStaffFunction] = useState<string>("");

  useEffect(() => {
    if (state.success) onSuccess?.();
  }, [state.success, onSuccess]);

  return (
    <form onSubmit={keepValuesOnSubmit(formAction)} className="grid max-w-lg gap-4">
      {/* Encima del nombre, que es donde luego se antepone ("Dra. Ana Ruiz"); solo
          para quien ejerce como médico, según el rol y la función de más abajo. */}
      {practicesMedicine(role, staffFunction) && (
        <div className="space-y-2">
          <Label htmlFor="honorific">Tratamiento</Label>
          <select
            id="honorific"
            name="honorific"
            defaultValue="Dr."
            disabled={pending}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50"
          >
            {HONORIFICS.map((value) => (
              <option key={value} value={value}>
                {HONORIFIC_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">Nombre</Label>
          <Input id="firstName" name="firstName" required disabled={pending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Apellidos</Label>
          <Input id="lastName" name="lastName" required disabled={pending} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" name="password" type="password" minLength={8} required disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">Rol</Label>
        <select
          id="role"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          disabled={pending}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50"
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
          <Label htmlFor="staffFunction">Función adicional</Label>
          <select
            id="staffFunction"
            name="staffFunction"
            value={staffFunction}
            onChange={(e) => setStaffFunction(e.target.value)}
            disabled={pending}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50"
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
