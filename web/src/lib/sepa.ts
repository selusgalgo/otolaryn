// Live preview of the SEPA mandate's monthly debit while the superadmin
// types — same arithmetic as the backend's sepa-amounts.util.ts (which is
// what actually prints on the PDF): VAT and IRPF both on the base, integer
// cents, debit = base + VAT − IRPF.

export interface SepaAmounts {
  baseCents: number;
  vatCents: number;
  irpfCents: number;
  totalCents: number;
}

export function computeSepaAmounts(
  monthlyBase: number,
  vatPercent: number,
  irpfPercent: number,
): SepaAmounts {
  const baseCents = Math.round(monthlyBase * 100);
  const vatCents = Math.round((baseCents * vatPercent) / 100);
  const irpfCents = Math.round((baseCents * irpfPercent) / 100);
  return {
    baseCents,
    vatCents,
    irpfCents,
    totalCents: baseCents + vatCents - irpfCents,
  };
}

const EURO = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

export function formatCents(cents: number): string {
  return EURO.format(cents / 100);
}

// "49,90" or "49.90" → 49.9 — Spanish users type a decimal comma.
export function parseDecimal(raw: string): number {
  return Number(raw.trim().replace(",", "."));
}

export const DEFAULT_VAT_PERCENT = 21;
export const DEFAULT_IRPF_PERCENT = 15;
