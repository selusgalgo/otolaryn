import { SessionKeepAlive } from "@/components/layout/session-keep-alive";
import { decodeJwtClaims } from "@/lib/jwt";
import { getSessionToken } from "@/lib/session";

// Lee el JWT de la cookie (httpOnly, inaccesible al navegador) y le pasa a
// SessionKeepAlive solo los instantes que necesita. Sin verificar la firma:
// es información para la interfaz, la que manda es la API.
export async function SessionGuard() {
  const claims = decodeJwtClaims(await getSessionToken());
  return (
    <SessionKeepAlive
      expiresAt={claims?.exp ? claims.exp * 1000 : null}
      issuedAt={claims?.iat ? claims.iat * 1000 : null}
      sessionEndsAt={claims?.session_end ? claims.session_end * 1000 : null}
    />
  );
}
