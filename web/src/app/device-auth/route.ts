import { NextRequest, NextResponse } from "next/server";
import { setDeviceToken } from "@/lib/session";

// The one-time install link an admin copies from Ajustes → Seguridad and
// sends to a clinic computer (e.g. by email, to be opened once on that
// machine): visiting it stores the clinic's device credential in a
// long-lived httpOnly cookie, after which every login/request from this
// browser carries it automatically (see api.ts, loginAction). No session
// required to visit this — see middleware.ts's isDeviceAuthPage carve-out.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t");
  if (token) {
    await setDeviceToken(token);
  }
  // A relative Location, not NextResponse.redirect(new URL("/login",
  // request.url)): behind this app's reverse proxy (both on
  // servidor.eiduo.es and Vercel), request.url reflects the Node process's
  // own bind host/port, not the public domain — an absolute redirect built
  // from it pointed browsers at http://localhost:3001/login instead of the
  // real site. middleware.ts's own redirects use the same relative-path
  // approach for the same reason.
  return new NextResponse(null, { status: 302, headers: { Location: "/login" } });
}
