"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PatientFormState } from "@/lib/actions/patients";
import type { Patient } from "@/lib/types";

interface PatientFormProps {
  action: (prevState: PatientFormState, formData: FormData) => Promise<PatientFormState>;
  initialValues?: Partial<Patient>;
  submitLabel: string;
}

const initialState: PatientFormState = {};

export function PatientForm({ action, initialValues, submitLabel }: PatientFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid max-w-lg gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">Nombre</Label>
          <Input id="firstName" name="firstName" defaultValue={initialValues?.firstName} required disabled={pending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Apellidos</Label>
          <Input id="lastName" name="lastName" defaultValue={initialValues?.lastName} required disabled={pending} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="documentId">Documento (DNI/NIE/pasaporte)</Label>
          <Input
            id="documentId"
            name="documentId"
            defaultValue={initialValues?.documentId}
            required
            maxLength={20}
            disabled={pending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dateOfBirth">Fecha de nacimiento</Label>
          <Input
            id="dateOfBirth"
            name="dateOfBirth"
            type="date"
            defaultValue={initialValues?.dateOfBirth?.slice(0, 10)}
            required
            disabled={pending}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Teléfono</Label>
        <Input id="phone" name="phone" defaultValue={initialValues?.phone} required disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" defaultValue={initialValues?.email ?? ""} disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Dirección</Label>
        <Input id="address" name="address" defaultValue={initialValues?.address ?? ""} disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notas</Label>
        <Input id="notes" name="notes" defaultValue={initialValues?.notes ?? ""} disabled={pending} />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando..." : submitLabel}
      </Button>
    </form>
  );
}
