import {
  computeSepaAmounts,
  formatCents,
  mandateReference,
} from './sepa-amounts.util';

describe('computeSepaAmounts', () => {
  it('adds VAT and subtracts IRPF, both on the base', () => {
    expect(computeSepaAmounts(100, 21, 15)).toEqual({
      baseCents: 10000,
      vatCents: 2100,
      irpfCents: 1500,
      totalCents: 10600,
    });
  });

  it('rounds each line to the cent', () => {
    // 49,90 × 21 % = 10,479 → 10,48 ; × 15 % = 7,485 → 7,49
    expect(computeSepaAmounts(49.9, 21, 15)).toEqual({
      baseCents: 4990,
      vatCents: 1048,
      irpfCents: 749,
      totalCents: 5289,
    });
  });

  it('handles a client with no IRPF withholding', () => {
    expect(computeSepaAmounts(80, 21, 0).totalCents).toBe(9680);
  });
});

describe('formatCents', () => {
  it('formats as Spanish euros', () => {
    expect(formatCents(10600).replace(/\s/g, ' ')).toBe('106,00 €');
  });
});

describe('mandateReference', () => {
  it('pads the number to four digits and appends the year', () => {
    expect(mandateReference(7, 2026)).toBe('MED-0007-2026');
  });
});
