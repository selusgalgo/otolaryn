import {
  isValidBic,
  isValidIban,
  isValidSepaCreditorId,
  isValidSpanishTaxId,
  normalizeCompact,
} from './sepa-validation.util';

describe('normalizeCompact', () => {
  it('uppercases and strips spaces, dashes and dots', () => {
    expect(normalizeCompact('es91 2100-0418.4502')).toBe('ES91210004184502');
  });
});

describe('isValidIban', () => {
  it('accepts a valid Spanish IBAN', () => {
    expect(isValidIban('ES9121000418450200051332')).toBe(true);
  });

  it('rejects a wrong check digit', () => {
    expect(isValidIban('ES9221000418450200051332')).toBe(false);
  });

  it('rejects a Spanish IBAN that is not 24 characters', () => {
    expect(isValidIban('ES912100041845020005133')).toBe(false);
  });

  it('accepts a valid IBAN from another SEPA country', () => {
    expect(isValidIban('DE89370400440532013000')).toBe(true);
  });
});

describe('isValidBic', () => {
  it.each(['CAIXESBBXXX', 'CAIXESBB'])('accepts %s', (bic) => {
    expect(isValidBic(bic)).toBe(true);
  });

  it('rejects a malformed BIC', () => {
    expect(isValidBic('CAIX12')).toBe(false);
  });
});

describe('isValidSpanishTaxId', () => {
  it.each(['12345678Z', 'X1234567L', 'B12345674'])('accepts %s', (id) => {
    expect(isValidSpanishTaxId(id)).toBe(true);
  });

  it.each(['12345678A', 'X1234567A', 'B12345675', 'ABC'])(
    'rejects %s',
    (id) => {
      expect(isValidSpanishTaxId(id)).toBe(false);
    },
  );
});

describe('isValidSepaCreditorId', () => {
  it('accepts a creditor id whose check digits match', () => {
    expect(isValidSepaCreditorId('ES58ZZZ12345678Z')).toBe(true);
  });

  it('ignores the business code when checking (any suffix is valid)', () => {
    expect(isValidSepaCreditorId('ES5800112345678Z')).toBe(true);
  });

  it('rejects wrong check digits', () => {
    expect(isValidSepaCreditorId('ES59ZZZ12345678Z')).toBe(false);
  });

  it('rejects a plain NIF', () => {
    expect(isValidSepaCreditorId('12345678Z')).toBe(false);
  });
});
