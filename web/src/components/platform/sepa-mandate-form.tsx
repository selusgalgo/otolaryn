"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { SepaFormField } from "@/components/platform/sepa-form-field";
import type { SepaFormState } from "@/lib/actions/platform";
import { keepValuesOnSubmit } from "@/lib/form-submit";
import {
  computeSepaAmounts,
  DEFAULT_IRPF_PERCENT,
  DEFAULT_VAT_PERCENT,
  formatCents,
  parseDecimal,
} from "@/lib/sepa";
import type { SepaMandate, TenantSepaMandate } from "@/lib/types";

interface SepaMandateFormProps {
  action: (
    prevState: SepaFormState,
    formData: FormData,
  ) => Promise<SepaFormState>;
  data: TenantSepaMandate;
  // A signed mandate is immutable on the API; the form says so instead of
  // letting the superadmin type into something that will be refused.
  locked?: boolean;
}

const initialState: SepaFormState = {};

// First day of next month, as YYYY-MM-DD — the usual start for a monthly fee.
function firstOfNextMonth(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  return `${next.getFullYear()}-${mm}-01`;
}

// "49.9" → "49,90" for the input's initial value.
function decimalInput(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function percentInput(value: number): string {
  return String(value).replace(".", ",");
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="grid gap-4 sm:col-span-6 sm:grid-cols-6">
      <legend className="mb-1 text-sm font-semibold text-primary">
        {title}
      </legend>
      {hint && (
        <p className="-mt-2 text-xs text-muted-foreground sm:col-span-6">
          {hint}
        </p>
      )}
      {children}
    </fieldset>
  );
}

export function SepaMandateForm({
  action,
  data,
  locked = false,
}: SepaMandateFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const m: Partial<SepaMandate> = data.mandate ?? {};

  // Controlled only so the debit preview can follow what's typed.
  const [base, setBase] = useState(
    m.monthlyBase !== undefined ? decimalInput(m.monthlyBase) : "",
  );
  const [vat, setVat] = useState(
    percentInput(m.vatPercent ?? DEFAULT_VAT_PERCENT),
  );
  const [irpf, setIrpf] = useState(
    percentInput(m.irpfPercent ?? DEFAULT_IRPF_PERCENT),
  );

  const numbers = [parseDecimal(base), parseDecimal(vat), parseDecimal(irpf)];
  const amounts =
    numbers.every(Number.isFinite) && numbers[0] > 0
      ? computeSepaAmounts(numbers[0], numbers[1], numbers[2])
      : null;

  return (
    <form
      onSubmit={keepValuesOnSubmit(formAction)}
      className="grid gap-6 sm:grid-cols-6"
    >
      <Section
        title="Titular de la cuenta"
        hint="Opcional: el cliente lo rellena él mismo desde el enlace de firma. Rellénalo solo si ya lo tienes."
      >
        <SepaFormField
          name="holderName"
          label="Nombre o razón social del titular"
          defaultValue={m.holderName ?? ""}
          disabled={pending || locked}
          className="sm:col-span-4"
        />
        <SepaFormField
          name="holderTaxId"
          label="NIF / CIF"
          defaultValue={m.holderTaxId ?? ""}
          disabled={pending || locked}
          className="sm:col-span-2"
        />
        <SepaFormField
          name="clinicName"
          label="Nombre de la clínica"
          defaultValue={m.clinicName ?? data.clinicDefaults.clinicName}
          required
          disabled={pending || locked}
          className="sm:col-span-6"
        />
        <SepaFormField
          name="signerName"
          label="Persona que firma"
          defaultValue={m.signerName ?? ""}
          disabled={pending || locked}
          className="sm:col-span-4"
        />
        <SepaFormField
          name="signerPosition"
          label="Cargo"
          defaultValue={m.signerPosition ?? ""}
          disabled={pending || locked}
          hint="Si el titular es una sociedad (p. ej. Administrador)."
          className="sm:col-span-2"
        />
      </Section>

      <Section title="Dirección y contacto" hint="También opcional.">
        <SepaFormField
          name="address"
          label="Dirección"
          defaultValue={m.address ?? ""}
          disabled={pending || locked}
          className="sm:col-span-6"
        />
        <SepaFormField
          name="postalCode"
          label="Código postal"
          defaultValue={m.postalCode ?? ""}
          disabled={pending || locked}
          inputMode="numeric"
          maxLength={5}
          className="sm:col-span-2"
        />
        <SepaFormField
          name="city"
          label="Población"
          defaultValue={m.city ?? ""}
          disabled={pending || locked}
          className="sm:col-span-2"
        />
        <SepaFormField
          name="province"
          label="Provincia"
          defaultValue={m.province ?? ""}
          disabled={pending || locked}
          className="sm:col-span-2"
        />
        <SepaFormField
          name="country"
          label="País"
          defaultValue={m.country ?? "España"}
          disabled={pending || locked}
          className="sm:col-span-2"
        />
        <SepaFormField
          name="email"
          label="Correo electrónico"
          type="email"
          defaultValue={m.email ?? ""}
          disabled={pending || locked}
          className="sm:col-span-2"
        />
        <SepaFormField
          name="phone"
          label="Teléfono"
          type="tel"
          defaultValue={m.phone ?? data.clinicDefaults.phone ?? ""}
          disabled={pending || locked}
          className="sm:col-span-2"
        />
      </Section>

      <Section title="Cuenta de cargo">
        <SepaFormField
          name="iban"
          label="IBAN"
          defaultValue={m.iban ?? ""}
          disabled={pending || locked}
          placeholder="ES00 0000 0000 0000 0000 0000"
          hint="Si lo dejas vacío, lo pone el cliente."
          className="sm:col-span-4"
          autoComplete="off"
        />
        <SepaFormField
          name="bic"
          label="BIC"
          defaultValue={m.bic ?? ""}
          disabled={pending || locked}
          className="sm:col-span-2"
          autoComplete="off"
        />
      </Section>

      <Section title="Plan contratado">
        <SepaFormField
          name="planName"
          label="Plan"
          defaultValue={m.planName ?? ""}
          required
          disabled={pending || locked}
          placeholder="p. ej. Mederi Profesional"
          className="sm:col-span-4"
        />
        <SepaFormField
          name="firstChargeDate"
          label="Fecha del primer cargo"
          type="date"
          defaultValue={m.firstChargeDate ?? firstOfNextMonth()}
          required
          disabled={pending || locked}
          className="sm:col-span-2"
        />
        <SepaFormField
          name="monthlyBase"
          label="Cuota mensual (base, €)"
          value={base}
          onChange={(e) => setBase(e.target.value)}
          inputMode="decimal"
          required
          disabled={pending || locked}
          placeholder="49,90"
          className="sm:col-span-2"
        />
        <SepaFormField
          name="vatPercent"
          label="IVA (%)"
          value={vat}
          onChange={(e) => setVat(e.target.value)}
          inputMode="decimal"
          required
          disabled={pending || locked}
          className="sm:col-span-2"
        />
        <SepaFormField
          name="irpfPercent"
          label="Retención IRPF (%)"
          value={irpf}
          onChange={(e) => setIrpf(e.target.value)}
          inputMode="decimal"
          required
          disabled={pending || locked}
          hint="0 si el cliente no tiene que retener."
          className="sm:col-span-2"
        />

        <dl className="grid gap-1 rounded-lg border bg-primary-tint p-4 text-sm sm:col-span-6 sm:max-w-sm">
          {amounts ? (
            <>
              <div className="flex justify-between">
                <dt>Base</dt>
                <dd>{formatCents(amounts.baseCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>IVA</dt>
                <dd>+ {formatCents(amounts.vatCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Retención IRPF</dt>
                <dd>− {formatCents(amounts.irpfCents)}</dd>
              </div>
              <div className="mt-1 flex justify-between border-t pt-2 font-semibold text-primary">
                <dt>Importe de cada adeudo</dt>
                <dd>{formatCents(amounts.totalCents)}</dd>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              Escribe la cuota para ver el importe que se cargará cada mes.
            </p>
          )}
        </dl>
      </Section>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <Button type="submit" disabled={pending || locked}>
          {pending
            ? "Guardando..."
            : data.mandate
              ? "Guardar cambios"
              : "Crear orden"}
        </Button>
        {locked && (
          <p className="text-sm text-muted-foreground">
            La orden está firmada: para cambiarla hay que cancelarla primero.
          </p>
        )}
        {state.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        {state.success && <p className="text-sm text-success">Guardado.</p>}
      </div>
    </form>
  );
}
