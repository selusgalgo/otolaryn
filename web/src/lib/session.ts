import { cookies } from "next/headers";

const COOKIE_NAME = "otolaryn_session";

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
