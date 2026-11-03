import { cookies } from "next/headers";
import { decodeJwtClaims } from "./jwt";

const COOKIE_NAME = "otolaryn_session";
const DEVICE_COOKIE_NAME = "otolaryn_device";

// httpOnly means client-side JS can never read this cookie — even if the
// frontend had an XSS bug, the token itself stays out of reach. That's the
// whole point of routing every API call through the server (Server
// Components / Route Handlers / Server Actions) instead of fetching from
// the browser directly.
// La cookie dura lo que el propio token (su `exp`), no una hora fija: si el
// backend corre con otro JWT_EXPIRES_IN, cookie y JWT caducan a la vez en vez
// de dejar una cookie que sigue enviando un token ya muerto. 1h solo si el
// token no se puede leer.
function sessionMaxAgeSeconds(token: string): number {
  const exp = decodeJwtClaims(token)?.exp;
  if (typeof exp !== "number") return 60 * 60;
  return Math.max(1, Math.floor(exp - Date.now() / 1000));
}

export async function setSessionToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAgeSeconds(token),
  });
}

export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value;
}

export async function clearSessionToken(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

// This computer's device credential, installed once via /device-auth (see
// that Route Handler). Unlike the session cookie, this one has no maxAge —
// it should outlive any single login, since the whole point is "this
// computer stays authorized across logins/logouts" until an admin
// revokes/regenerates the clinic's credential server-side. Only ever read
// by apiFetch (to attach X-Device-Token) and loginAction (to forward it as
// deviceToken) — most tenants never set device lock, so this cookie is
// simply absent for them and every check involving it is a no-op.
export async function setDeviceToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(DEVICE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function getDeviceToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(DEVICE_COOKIE_NAME)?.value;
}
