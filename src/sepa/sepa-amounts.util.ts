// Monthly fee breakdown printed on the mandate. Both VAT and the IRPF
// withholding are applied to the base; the IRPF part is paid by the client
// straight to Hacienda, so the amount actually debited is base + VAT − IRPF.
// Worked in integer cents so 21 % of 49,90 € never drifts by a cent.

export interface SepaAmounts {
  baseCents: number;
  vatCents: number;
  irpfCents: number;
  totalCents: number;
}

export function toCents(euros: number): number {
  return Math.round(euros * 100);
}

export function computeSepaAmounts(
  monthlyBase: number,
  vatPercent: number,
  irpfPercent: number,
): SepaAmounts {
  const baseCents = toCents(monthlyBase);
  const vatCents = Math.round((baseCents * vatPercent) / 100);
  const irpfCents = Math.round((baseCents * irpfPercent) / 100);
  return {
    baseCents,
    vatCents,
    irpfCents,
    totalCents: baseCents + vatCents - irpfCents,
  };
}

const EURO = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

export function formatCents(cents: number): string {
  return EURO.format(cents / 100);
}

/** "21" or "7,5" — percentages as Spanish readers write them. */
export function formatPercent(value: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(
    value,
  );
}

/** MED-0001-2026: zero-padded mandate number + year it was created. */
export function mandateReference(number: number, year: number): string {
  return `MED-${String(number).padStart(4, '0')}-${year}`;
}
