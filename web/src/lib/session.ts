import { cookies } from "next/headers";

const COOKIE_NAME = "otolaryn_session";
const DEVICE_COOKIE_NAME = "otolaryn_device";

// httpOnly means client-side JS can never read this cookie — even if the
// frontend had an XSS bug, the token itself stays out of reach. That's the
// whole point of routing every API call through the server (Server
// Components / Route Handlers / Server Actions) instead of fetching from
// the browser directly.
export async function setSessionToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60, // matches the backend's default JWT_EXPIRES_IN=1h
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
