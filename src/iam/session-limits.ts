// Límite absoluto de una sesión, con independencia de que se vaya renovando:
// una persona que no para de trabajar mantiene la sesión viva con
// POST /auth/refresh, pero nunca más allá de `session_end` (fijado al entrar,
// ver AuthService.login). Sin este tope, un token robado podría renovarse
// indefinidamente.
export const DEFAULT_SESSION_MAX_HOURS = 12;

export function sessionEndFrom(nowSec: number, maxHours: number): number {
  return nowSec + Math.round(maxHours * 3600);
}

// Tokens emitidos antes de existir `session_end`: se le calcula uno a partir
// de su `iat`, para que también ellos tengan techo.
export function effectiveSessionEnd(
  claim: number | undefined,
  iat: number | undefined,
  maxHours: number,
): number | undefined {
  if (typeof claim === 'number') return claim;
  if (typeof iat === 'number') return sessionEndFrom(iat, maxHours);
  return undefined;
}

export function isSessionOver(
  sessionEnd: number | undefined,
  nowSec: number,
): boolean {
  return sessionEnd !== undefined && nowSec >= sessionEnd;
}
