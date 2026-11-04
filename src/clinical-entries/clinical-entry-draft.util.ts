// Una consulta puede ser un borrador (se está escribiendo, visible solo para su
// autor y los administradores) o estar firmada (la que cuenta en la historia
// clínica, los PDF y el resto de la app). Ver la migración ClinicalEntryDraft.
export type ClinicalEntryStatus = 'borrador' | 'firmada';

// Un borrador sin tocar durante este tiempo se borra solo (ver
// ClinicalEntryDraftsPurgeService) y mientras tanto deja de listarse. La web
// avisa de la fecha en la ficha del paciente y en el panel de inicio.
export const DRAFT_TTL_DAYS = 10;
export const DRAFT_TTL_MS = DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000;

export function draftCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - DRAFT_TTL_MS);
}

export function draftExpiresAt(entry: {
  status: ClinicalEntryStatus;
  draftUpdatedAt: Date | null;
}): Date | null {
  if (entry.status !== 'borrador' || !entry.draftUpdatedAt) return null;
  return new Date(entry.draftUpdatedAt.getTime() + DRAFT_TTL_MS);
}

export function withDraftExpiry<
  T extends { status: ClinicalEntryStatus; draftUpdatedAt: Date | null },
>(entry: T): T & { draftExpiresAt: Date | null } {
  return { ...entry, draftExpiresAt: draftExpiresAt(entry) };
}
