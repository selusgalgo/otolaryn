import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "otolaryn_session";

// Presence-only check: it just decides whether to bounce to /login, it
// doesn't verify the JWT's signature. Verification still happens for real
// on every request — the NestJS API rejects a tampered/expired token with
// 401 the moment a Server Component or Server Action calls it. Middleware
// runs on the Edge runtime, which can't easily use the same crypto stack
// as the API, so it isn't the security boundary here — the API is.
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has(COOKIE_NAME);
  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/login";
  // The one-time device-install link an admin sends to a clinic computer —
  // visited before anyone has logged in there, so it can't require a
  // session cookie. It only ever sets the long-lived device cookie and
  // redirects to /login itself.
  const isDeviceAuthPage = pathname === "/device-auth";
  // A Server Action call (e.g. "Guardar" on a form) posts to the same
  // page URL it's on, carrying this header — if the session cookie
  // expired/disappeared mid-task and this redirects like any other
  // request, the client can't make sense of a redirect in place of the
  // action's actual return value and crashes instead of rendering
  // whatever that action returned (here, a graceful "tu sesión ha
  // caducado" state — see ClinicalEntryForm/clinical-entries actions).
  // Letting it through is safe: the action itself calls the backend API,
  // which re-verifies the JWT on every request regardless (see this
  // file's own comment above on where the real security boundary is).
  const isServerAction = request.headers.has("next-action");

  if (!hasSession && !isLoginPage && !isDeviceAuthPage && !isServerAction) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSession && isLoginPage) {
    // Not role-aware here on purpose (no JWT decoding at the edge) — lands
    // everyone on /dashboard, which (app)/layout.tsx immediately bounces
    // superadmin onward from, same as visiting "/" directly.
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Also excludes static assets served from public/ (e.g. logo.svg) — without
  // this, an unauthenticated request for one of those files gets redirected
  // to /login instead of served, and shows up as a broken image.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
