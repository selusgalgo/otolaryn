"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { SepaFormField } from "@/components/platform/sepa-form-field";
import type { SepaPublicFormState } from "@/lib/actions/sepa-public";
import { keepValuesOnSubmit } from "@/lib/form-submit";
import type { PublicSepaView } from "@/lib/types";

interface SepaDebtorFormProps {
  action: (prevState: SepaPublicFormState, formData: FormData) => Promise<SepaPublicFormState>;
  debtor: PublicSepaView["debtor"];
  // Already saved once: the button then says so, and a re-save regenerates
  // the document the client is about to review.
  alreadySaved: boolean;
}

const initialState: SepaPublicFormState = {};

// The clinic owner's own data — account holder, who signs, address, IBAN.
// Saving it is what generates the document they then review and sign.
export function SepaDebtorForm({ action, debtor: d, alreadySaved }: SepaDebtorFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form onSubmit={keepValuesOnSubmit(formAction)} className="grid gap-4 sm:grid-cols-6">
      <SepaFormField
        name="holderName"
        label="Titular de la cuenta (nombre o razón social)"
        defaultValue={d.holderName ?? ""}
        required
        disabled={pending}
        autoComplete="organization"
        className="sm:col-span-4"
      />
      <SepaFormField
        name="holderTaxId"
        label="NIF / CIF del titular"
        defaultValue={d.holderTaxId ?? ""}
        required
        disabled={pending}
        className="sm:col-span-2"
      />
      <SepaFormField
        name="signerName"
        label="Persona que firma"
        defaultValue={d.signerName ?? ""}
        required
        disabled={pending}
        autoComplete="name"
        hint="Nombre y apellidos tal como los escribirás al firmar."
        className="sm:col-span-4"
      />
      <SepaFormField
        name="signerPosition"
        label="Cargo"
        defaultValue={d.signerPosition ?? ""}
        disabled={pending}
        hint="Si el titular es una sociedad (p. ej. Administrador)."
        className="sm:col-span-2"
      />
      <SepaFormField
        name="address"
        label="Dirección"
        defaultValue={d.address ?? ""}
        required
        disabled={pending}
        autoComplete="street-address"
        className="sm:col-span-6"
      />
      <SepaFormField
        name="postalCode"
        label="Código postal"
        defaultValue={d.postalCode ?? ""}
        required
        disabled={pending}
        inputMode="numeric"
        maxLength={5}
        autoComplete="postal-code"
        className="sm:col-span-2"
      />
      <SepaFormField
        name="city"
        label="Población"
        defaultValue={d.city ?? ""}
        required
        disabled={pending}
        className="sm:col-span-2"
      />
      <SepaFormField
        name="province"
        label="Provincia"
        defaultValue={d.province ?? ""}
        required
        disabled={pending}
        className="sm:col-span-2"
      />
      <SepaFormField
        name="country"
        label="País"
        defaultValue={d.country ?? "España"}
        required
        disabled={pending}
        className="sm:col-span-2"
      />
      <SepaFormField
        name="email"
        label="Correo electrónico"
        type="email"
        defaultValue={d.email ?? ""}
        required
        disabled={pending}
        autoComplete="email"
        className="sm:col-span-2"
      />
      <SepaFormField
        name="phone"
        label="Teléfono"
        type="tel"
        defaultValue={d.phone ?? ""}
        disabled={pending}
        autoComplete="tel"
        className="sm:col-span-2"
      />
      <SepaFormField
        name="iban"
        label="IBAN de la cuenta donde se cargarán los recibos"
        defaultValue={d.iban ?? ""}
        required
        disabled={pending}
        placeholder="ES00 0000 0000 0000 0000 0000"
        autoComplete="off"
        className="sm:col-span-4"
      />
      <SepaFormField
        name="bic"
        label="BIC"
        defaultValue={d.bic ?? ""}
        disabled={pending}
        autoComplete="off"
        hint="Solo si tu banco te lo pide."
        className="sm:col-span-2"
      />

      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Guardando..."
            : alreadySaved
              ? "Guardar cambios y actualizar el documento"
              : "Guardar y ver el documento"}
        </Button>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
    </form>
  );
}
