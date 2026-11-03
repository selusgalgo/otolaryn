// Solo rutas internas relativas ("/patients/123/..."), nunca lo que venga
// en ?redirect= tal cual — si no, un enlace de login manipulado podría
// mandar a alguien fuera de la app tras autenticarse (open redirect).
// "//evil.com" o "/\evil.com" parecen relativos, pero el navegador los trata
// como absolutos (normaliza "\" a "/" y descarta tabs/saltos de línea), así
// que en vez de buscar patrones se resuelve contra un origen ficticio y se
// exige que el origen no cambie.
const REDIRECT_BASE = "http://internal.invalid";

export function safeRedirectTarget(raw: unknown): string | null {
  const value = typeof raw === "string" ? raw : "";
  if (!value.startsWith("/") || /[\\\u0000-\u001F\u007F]/.test(value)) {
    return null;
  }
  try {
    const url = new URL(value, REDIRECT_BASE);
    if (url.origin !== REDIRECT_BASE) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
