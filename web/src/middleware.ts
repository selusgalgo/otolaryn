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

  if (!hasSession && !isLoginPage) {
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
