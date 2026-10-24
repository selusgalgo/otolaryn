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
  return NextResponse.redirect(new URL("/login", request.url));
}
