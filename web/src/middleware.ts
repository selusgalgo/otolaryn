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
    return NextResponse.redirect(new URL("/patients", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
