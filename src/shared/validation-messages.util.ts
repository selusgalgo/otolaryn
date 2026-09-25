// class-validator's built-in decorator messages (@IsString, @MinLength,
// @IsEmail, ...) are English by default, and the ValidationPipe forwards
// them verbatim as the 400 response's `message` — which every Server
// Action in the frontend shows straight to the user (see ApiError in
// web/src/lib/api.ts). Every DTO in this app relies on those defaults
// (none pass a custom `message` per decorator), so the fix lives here
// once instead of touching every decorator everywhere: this pattern-
// matches class-validator's own fixed English templates and swaps in a
// Spanish equivalent, keeping the same property name and any numeric/
// list arguments the original message carried.
//
// This is deliberately regex-based against the rendered message, not a
// re-implementation of class-validator's own message-building — the
// alternative (a custom `message` callback on every decorator, in every
// DTO, project-wide) is exactly the maintenance burden this avoids: any
// new DTO gets a Spanish message for free just by using the same
// decorators everyone already uses.
const PATTERNS: [RegExp, (property: string, ...args: string[]) => string][] = [
  [/^(.+) should not be empty$/, (p) => `${p} no puede estar vacío`],
  [/^(.+) must be a string$/, (p) => `${p} debe ser un texto`],
  [
    /^(.+) must be longer than or equal to (\d+) characters$/,
    (p, n) => `${p} debe tener al menos ${n} caracteres`,
  ],
  [
    /^(.+) must be shorter than or equal to (\d+) characters$/,
    (p, n) => `${p} debe tener como máximo ${n} caracteres`,
  ],
  [
    /^(.+) must be longer than or equal to (\d+) and shorter than or equal to (\d+) characters$/,
    (p, min, max) => `${p} debe tener entre ${min} y ${max} caracteres`,
  ],
  [/^(.+) must be an email$/, (p) => `${p} no es un email válido`],
  [/^(.+) must be a UUID$/, (p) => `${p} no es un identificador válido`],
  [
    /^(.+) must be a valid ISO 8601 date string$/,
    (p) => `${p} no es una fecha válida`,
  ],
  [/^(.+) must be a boolean value$/, (p) => `${p} debe ser verdadero o falso`],
  [/^(.+) must be an array$/, (p) => `${p} debe ser una lista`],
  [
    /^(.+) must contain at least (\d+) elements?$/,
    (p, n) => `${p} debe tener al menos ${n} elemento(s)`,
  ],
  [
    /^(.+) must contain not more than (\d+) elements?$/,
    (p, n) => `${p} debe tener como máximo ${n} elemento(s)`,
  ],
  [
    /^each value in (.+) must be a string$/,
    (p) => `cada valor de ${p} debe ser un texto`,
  ],
  [
    /^(.+) must be a number conforming to the specified constraints$/,
    (p) => `${p} debe ser un número`,
  ],
  [
    /^(.+) must not be less than (\S+)$/,
    (p, n) => `${p} no puede ser menor que ${n}`,
  ],
  [
    /^(.+) must not be greater than (\S+)$/,
    (p, n) => `${p} no puede ser mayor que ${n}`,
  ],
  [
    /^(.+) must be one of the following values: (.+)$/,
    (p, values) => `${p} debe ser uno de estos valores: ${values}`,
  ],
  [/^(.+) must match (.+)$/, (p) => `${p} no tiene el formato esperado`],
  [/^property (.+) should not exist$/, (p) => `no se esperaba el campo "${p}"`],
];

function translateOne(message: string): string {
  for (const [pattern, translate] of PATTERNS) {
    const match = pattern.exec(message);
    if (match) {
      const [, ...groups] = match;
      return translate(...(groups as [string, ...string[]]));
    }
  }
  // Nothing matched (a validator this list doesn't cover yet) — a generic
  // Spanish fallback beats forwarding the raw English string.
  return 'Hay un dato con un formato no válido';
}

export function translateValidationMessages(messages: string[]): string[] {
  return messages.map(translateOne);
}

// A shape-only subset of class-validator's ValidationError — avoids
// importing the real type here just to walk `.constraints`/`.children`.
interface ValidationErrorLike {
  constraints?: Record<string, string>;
  children?: ValidationErrorLike[];
}

// Nested DTOs (e.g. a day's list of time slots in the schedule, or an
// array of antecedente rows) fail as `children` on the outer
// ValidationError rather than flat `constraints` — walked recursively so
// a nested field's error still reaches the response instead of silently
// vanishing.
export function flattenValidationMessages(
  errors: ValidationErrorLike[],
): string[] {
  const messages: string[] = [];
  for (const error of errors) {
    if (error.constraints) {
      messages.push(...Object.values(error.constraints));
    }
    if (error.children?.length) {
      messages.push(...flattenValidationMessages(error.children));
    }
  }
  return messages;
}
