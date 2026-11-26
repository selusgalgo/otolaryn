"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { SepaFormField } from "@/components/platform/sepa-form-field";
import type { SepaFormState } from "@/lib/actions/platform";
import { keepValuesOnSubmit } from "@/lib/form-submit";
import type { CreditorProfile } from "@/lib/types";

interface CreditorProfileFormProps {
  action: (
    prevState: SepaFormState,
    formData: FormData,
  ) => Promise<SepaFormState>;
  initialProfile: CreditorProfile;
}

const initialState: SepaFormState = {};

// Who collects Mederi's fees — printed as "Acreedor" on every SEPA mandate.
export function CreditorProfileForm({
  action,
  initialProfile: p,
}: CreditorProfileFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form
      onSubmit={keepValuesOnSubmit(formAction)}
      className="grid gap-4 sm:grid-cols-6"
    >
      <SepaFormField
        name="name"
        label="Nombre o razón social"
        defaultValue={p.name}
        required
        disabled={pending}
        className="sm:col-span-4"
      />
      <SepaFormField
        name="taxId"
        label="NIF / CIF"
        defaultValue={p.taxId}
        required
        disabled={pending}
        className="sm:col-span-2"
      />
      <SepaFormField
        name="sepaCreditorId"
        label="Identificador de acreedor SEPA"
        defaultValue={p.sepaCreditorId}
        required
        disabled={pending}
        hint="Lo asigna tu banco al dar de alta las remesas (p. ej. ES12ZZZ12345678Z)."
        className="sm:col-span-6"
      />
      <SepaFormField
        name="address"
        label="Dirección"
        defaultValue={p.address}
        required
        disabled={pending}
        className="sm:col-span-6"
      />
      <SepaFormField
        name="postalCode"
        label="Código postal"
        defaultValue={p.postalCode}
        required
        disabled={pending}
        inputMode="numeric"
        maxLength={5}
        className="sm:col-span-2"
      />
      <SepaFormField
        name="city"
        label="Población"
        defaultValue={p.city}
        required
        disabled={pending}
        className="sm:col-span-2"
      />
      <SepaFormField
        name="province"
        label="Provincia"
        defaultValue={p.province}
        required
        disabled={pending}
        className="sm:col-span-2"
      />
      <SepaFormField
        name="country"
        label="País"
        defaultValue={p.country}
        required
        disabled={pending}
        className="sm:col-span-2"
      />
      <SepaFormField
        name="email"
        label="Correo electrónico"
        type="email"
        defaultValue={p.email}
        required
        disabled={pending}
        hint="Las clínicas enviarán aquí la orden firmada."
        className="sm:col-span-4"
      />
      <SepaFormField
        name="phone"
        label="Teléfono"
        type="tel"
        defaultValue={p.phone}
        required
        disabled={pending}
        className="sm:col-span-3"
      />
      <SepaFormField
        name="website"
        label="Web"
        defaultValue={p.website ?? ""}
        disabled={pending}
        className="sm:col-span-3"
      />

      <div className="flex items-center gap-3 sm:col-span-6">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando..." : "Guardar"}
        </Button>
        {state.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        {state.success && <p className="text-sm text-success">Guardado.</p>}
      </div>
    </form>
  );
}
