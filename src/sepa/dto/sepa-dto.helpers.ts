import { ValidateBy } from 'class-validator';
import { spanishMessage } from '../../shared/validation-messages.util';
import {
  isValidBic,
  isValidIban,
  isValidSepaCreditorId,
  isValidSpanishTaxId,
  normalizeCompact,
} from '../sepa-validation.util';

// Shared by UpdateCreditorProfileDto and UpsertSepaMandateDto.

export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// For optional fields coming from a form: "" means "not provided".
export const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

// Identifiers are stored compact and uppercase (ES9121000418450200051332,
// 12345678Z) so the PDF can lay them out consistently and validation
// doesn't trip over the spaces people type.
export const compact = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const normalized = normalizeCompact(value);
  return normalized === '' ? null : normalized;
};

function validator(
  name: string,
  test: (v: string) => boolean,
  rawMessage: string,
) {
  const message = spanishMessage(rawMessage);
  return ValidateBy({
    name,
    validator: {
      validate: (value: unknown) => typeof value === 'string' && test(value),
      defaultMessage: () => message,
    },
  });
}

export const IsIban = () =>
  validator('isIban', isValidIban, 'El IBAN no es válido');

export const IsBic = () =>
  validator('isBic', isValidBic, 'El BIC no es válido (8 u 11 caracteres)');

export const IsSpanishTaxId = (field: string) =>
  validator(
    'isSpanishTaxId',
    isValidSpanishTaxId,
    `${field}: el NIF/CIF no es válido`,
  );

export const IsSepaCreditorId = () =>
  validator(
    'isSepaCreditorId',
    isValidSepaCreditorId,
    'El identificador de acreedor SEPA no es válido (p. ej. ES12ZZZ12345678Z)',
  );

export const POSTAL_CODE_MESSAGE = spanishMessage(
  'El código postal debe tener 5 dígitos',
);
export const EMAIL_MESSAGE = spanishMessage(
  'El correo electrónico no es válido',
);

// A required free-text field: one clear message instead of the three a
// stacked @IsString/@MinLength/@MaxLength would each raise on an empty value.
export const RequiredText = (label: string, max: number) =>
  validator(
    'requiredText',
    (v) => v.length >= 1 && v.length <= max,
    `${label} es obligatorio (máximo ${max} caracteres)`,
  );
