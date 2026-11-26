export type FieldErrorMap = Record<string, string>;

export interface FormErrorResult {
  fieldErrors: FieldErrorMap;
  formError?: string;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Turn API validation messages into errors beside the corresponding fields. */
export function mapFormError(
  message: string,
  fields: Record<string, string[]>,
  customMatchers: Record<string, RegExp> = {},
  labels: Record<string, string> = {},
): FormErrorResult {
  const fieldErrors: FieldErrorMap = {};
  const remaining: string[] = [];

  for (const part of message
    .split(/,\s+(?=[\w\p{L}])/u)
    .map((item) => item.trim())
    .filter(Boolean)) {
    const normalized = normalize(part);
    const match = Object.entries(fields).find(([field, aliases]) => {
      const names = [field, ...aliases].map(normalize);
      return (
        names.some((name) => normalized.includes(name)) ||
        customMatchers[field]?.test(part) === true
      );
    });

    if (match) {
      const [field, aliases] = match;
      const prefix = [field, ...aliases].find((name) =>
        part.toLowerCase().startsWith(`${name.toLowerCase()} `),
      );
      const displayMessage = prefix
        ? `${labels[field] ?? field}${part.slice(prefix.length)}`
        : part;
      fieldErrors[field] = displayMessage;
    } else remaining.push(part);
  }

  return {
    fieldErrors,
    ...(remaining.length ? { formError: remaining.join(", ") } : {}),
  };
}

/** Focus the first invalid control after a server validation response. */
export function focusFirstFieldError(
  form: HTMLFormElement | null,
  fieldErrors: FieldErrorMap | undefined,
): void {
  const firstField = Object.keys(fieldErrors ?? {})[0];
  if (!form || !firstField) return;
  const control = form.elements.namedItem(firstField);
  if (control instanceof HTMLElement) control.focus();
}
