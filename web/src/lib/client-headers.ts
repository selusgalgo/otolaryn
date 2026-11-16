import { headers } from "next/headers";

// The API only ever sees this Next server as its caller. The public signing
// pages (/sepa/[token]) forward the visitor's address and browser so the API
// can record them as signing evidence and rate-limit per visitor, not per
// server.
//
// Which header to believe matters: the evidence is only worth keeping if a
// visitor can't choose their own address. The front nginx *overwrites*
// X-Real-IP with the connection's real address, so that one is trusted first.
// X-Forwarded-For is only appended to (a client can send their own value, and
// it ends up first), so when falling back to it the LAST entry is the one
// added by our own proxy — never the first.
export async function clientHeaders(): Promise<Record<string, string>> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean);
  const ip = h.get("x-real-ip")?.trim() || forwarded?.at(-1) || "";
  const userAgent = h.get("user-agent") ?? "";
  return {
    ...(ip ? { "X-Client-IP": ip } : {}),
    ...(userAgent ? { "X-Client-User-Agent": userAgent.slice(0, 300) } : {}),
  };
}
