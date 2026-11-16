// Pure checks for the identifiers a SEPA direct-debit mandate carries. All
// of them take already-normalized input (see normalizeCompact) — the DTOs
// normalize first, then validate, so "es12 3456 ..." typed with spaces and
// lowercase still passes.

/** Uppercase and strip spaces/dashes/dots: "es91 2100-0418" → "ES9121000418". */
export function normalizeCompact(value: string): string {
  return value.toUpperCase().replace(/[\s.-]/g, '');
}

// ISO 7064 mod 97-10: letters become two digits (A=10 … Z=35). Processed
// digit by digit so a 34-char IBAN never needs a BigInt.
function mod97(alphanumeric: string): number {
  let remainder = 0;
  for (const char of alphanumeric) {
    const code = char.charCodeAt(0);
    const digits = code >= 65 && code <= 90 ? String(code - 55) : char;
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder;
}

// Spanish IBANs are always 24 characters; other SEPA countries vary between
// 15 and 34. Any country is accepted — a clinic could bank abroad.
export function isValidIban(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith('ES') && iban.length !== 24) return false;
  return mod97(iban.slice(4) + iban.slice(0, 4)) === 1;
}

export function isValidBic(bic: string): boolean {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic);
}

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

function isValidDniOrNie(id: string): boolean {
  const match = /^([XYZ]|\d)(\d{7})([A-Z])$/.exec(id);
  if (!match) return false;
  const nieLead: Record<string, string> = { X: '0', Y: '1', Z: '2' };
  const lead = nieLead[match[1]] ?? match[1];
  const number = Number(lead + match[2]);
  return DNI_LETTERS[number % 23] === match[3];
}

// CIF: letter + 7 digits + control (digit or letter, depending on the
// entity type). Some letters force a letter control (P, Q, R, S, N, W),
// others a digit (A, B, E, H); the rest accept either.
function isValidCif(id: string): boolean {
  const match = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(id);
  if (!match) return false;
  const [, type, digits, control] = match;
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const n = Number(digits[i]);
    if (i % 2 === 0) {
      const doubled = n * 2;
      sum += Math.floor(doubled / 10) + (doubled % 10);
    } else {
      sum += n;
    }
  }
  const controlDigit = (10 - (sum % 10)) % 10;
  const controlLetter = 'JABCDEFGHI'[controlDigit];
  if ('PQRSNW'.includes(type)) return control === controlLetter;
  if ('ABEH'.includes(type)) return control === String(controlDigit);
  return control === String(controlDigit) || control === controlLetter;
}

/** NIF of a person (DNI/NIE) or of a company (CIF). */
export function isValidSpanishTaxId(id: string): boolean {
  return isValidDniOrNie(id) || isValidCif(id);
}

// SEPA Creditor Identifier (EPC262-08): country(2) + check digits(2) +
// business code(3, free — "ZZZ" by default) + national id. The check digits
// are computed over national id + country + "00", skipping the business
// code, which is why the bank can hand out any suffix without changing them.
export function isValidSepaCreditorId(id: string): boolean {
  const match = /^([A-Z]{2})(\d{2})([A-Z0-9]{3})([A-Z0-9]{1,28})$/.exec(id);
  if (!match) return false;
  const [, country, check, , nationalId] = match;
  const expected = 98 - mod97(nationalId + country + '00');
  return Number(check) === expected;
}
