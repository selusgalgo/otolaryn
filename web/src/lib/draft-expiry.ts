// Un borrador de consulta que nadie toca durante 10 días se borra solo (ver
// ClinicalEntryDraftsPurgeService en la API). Estas funciones convierten la
// fecha de caducidad que manda la API en el aviso que se enseña: la etiqueta
// "Borrador" de la ficha y del panel de inicio.
const DAY_MS = 24 * 60 * 60 * 1000;

// A partir de cuántos días restantes el aviso pasa a tono de alerta.
export const DRAFT_WARN_DAYS = 3;

export function draftDaysLeft(expiresAt: string | null, now: number = Date.now()): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / DAY_MS));
}

export function isDraftExpiringSoon(expiresAt: string | null, now: number = Date.now()): boolean {
  const days = draftDaysLeft(expiresAt, now);
  return days !== null && days <= DRAFT_WARN_DAYS;
}

export function draftExpiryText(expiresAt: string | null, now: number = Date.now()): string {
  const days = draftDaysLeft(expiresAt, now);
  if (days === null) return "";
  if (days === 0) return "Se borra hoy si no lo terminas";
  if (days === 1) return "Se borra mañana si no lo terminas";
  return `Se borra en ${days} días si no lo terminas`;
}
