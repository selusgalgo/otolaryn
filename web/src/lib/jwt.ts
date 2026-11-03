// Lectura SIN verificar de un JWT, solo para decisiones de interfaz (¿ya
// caducó?, ¿de quién son los borradores locales?). Nunca es una comprobación
// de seguridad: la que cuenta es la de la API en cada petición. Sin
// dependencias de Node (atob) para que valga también en el middleware (Edge).
export interface JwtClaims {
  exp?: number;
  iat?: number;
  // Fin absoluto de la sesión (segundos epoch): renovar no lo alarga.
  session_end?: number;
  sub?: string;
  tenant_id?: string | null;
}

export function decodeJwtClaims(token: string | undefined): JwtClaims | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
    const claims = JSON.parse(json) as unknown;
    return claims && typeof claims === "object" ? (claims as JwtClaims) : null;
  } catch {
    return null;
  }
}

// true solo si el token trae un `exp` ya pasado — un token ilegible no se
// da por caducado (lo decidirá la API).
export function isJwtExpired(token: string | undefined, nowMs: number = Date.now()): boolean {
  const exp = decodeJwtClaims(token)?.exp;
  return typeof exp === "number" && exp * 1000 <= nowMs;
}
