"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PatientFormState } from "@/lib/actions/patients";
import type { InsuranceOption } from "@/lib/insurance";
import type { PractitionerOption } from "@/lib/practitioners";
import type { Patient } from "@/lib/types";

interface PatientFormProps {
  action: (prevState: PatientFormState, formData: FormData) => Promise<PatientFormState>;
  initialValues?: Partial<Patient>;
  submitLabel: string;
  // Pre-rendered JSX, not a component reference — this form can be used
  // from a Server Component page (e.g. /appointments/new), and only plain
  // React elements survive that server-to-client props boundary, not
  // function/forwardRef values like a bare icon component.
  submitIcon?: React.ReactNode;
  // Called after a successful submit — used by the dialog wrappers to
  // close themselves, since these actions revalidate instead of redirecting.
  onSuccess?: () => void;
  insuranceOptions?: InsuranceOption[];
  // null (not just an empty array) hides the "Médico habitual" field
  // entirely — same meaning as everywhere else PractitionerOption is used:
  // this role has no picker to offer (currently profesional; see
  // getPractitionerOptions).
  practitionerOptions?: PractitionerOption[] | null;
}

const initialState: PatientFormState = {};

export function PatientForm({
  action,
  initialValues,
  submitLabel,
  submitIcon,
  onSuccess,
  insuranceOptions,
  practitionerOptions,
}: PatientFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.success) onSuccess?.();
  }, [state.success, onSuccess]);

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
            defaultValue={initialValues?.documentId ?? ""}
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
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="address">Dirección</Label>
          <Input id="address" name="address" defaultValue={initialValues?.address ?? ""} disabled={pending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profession">Profesión</Label>
          <Input id="profession" name="profession" defaultValue={initialValues?.profession ?? ""} disabled={pending} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notas</Label>
        {/* Textarea, no Input: la importación de pacientes legados puede
            volcar aquí historias clínicas de varios miles de caracteres. */}
        <Textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={initialValues?.notes ?? ""}
          disabled={pending}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="insuranceEntityId">Aseguradora</Label>
          <select
            id="insuranceEntityId"
            name="insuranceEntityId"
            defaultValue={initialValues?.insuranceEntityId ?? ""}
            disabled={pending}
            className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm disabled:opacity-50"
          >
            <option value="">Sin especificar</option>
            {insuranceOptions?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="firstConsultationDate">Fecha de la primera cita</Label>
          <Input
            id="firstConsultationDate"
            name="firstConsultationDate"
            type="date"
            defaultValue={initialValues?.firstConsultationDate?.slice(0, 10) ?? ""}
            disabled={pending}
          />
        </div>
      </div>
      {practitionerOptions != null && (
        <div className="space-y-2">
          <Label htmlFor="assignedPractitionerId">Médico habitual</Label>
          <select
            id="assignedPractitionerId"
            name="assignedPractitionerId"
            defaultValue={initialValues?.assignedPractitionerId ?? ""}
            disabled={pending}
            className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm disabled:opacity-50"
          >
            <option value="">Sin asignar</option>
            {practitionerOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
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
