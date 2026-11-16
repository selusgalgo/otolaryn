// Does a file satisfy an <input accept="..."> list? The browser's own file
// dialog applies `accept` when *picking*, but a file dragged onto a dropzone
// skips it entirely — so the dropzone has to check dropped files itself.
// Same rules as the attribute: ".pdf" (extension), "image/*" (type family)
// or "image/png" (exact type), comma separated, case-insensitive.
export function matchesAccept(file: { name: string; type: string }, accept?: string): boolean {
  const rules = (accept ?? "")
    .split(",")
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean);
  if (rules.length === 0) return true;

  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith(".")) return name.endsWith(rule);
    if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}
