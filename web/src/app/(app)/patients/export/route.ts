import { NextRequest } from "next/server";
import { API_URL } from "@/lib/api";
import { getSessionToken } from "@/lib/session";

// A plain <a href> download can't carry the JWT — it lives in an httpOnly
// cookie only readable server-side (see lib/session.ts), and the API
// expects it as an Authorization header anyway, not a cookie. This Route
// Handler is the one place allowed to bridge that: read the token
// server-side, forward it to the API, stream the file straight back.
export async function GET(request: NextRequest): Promise<Response> {
  const token = await getSessionToken();
  const format = request.nextUrl.searchParams.get("format") ?? "csv";
  const search = request.nextUrl.searchParams.get("search");

  const query = new URLSearchParams({ format });
  if (search) query.set("search", search);

  const upstream = await fetch(`${API_URL}/patients/export?${query.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("No se pudo generar la exportación.", { status: upstream.status || 500 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": upstream.headers.get("content-disposition") ?? "attachment",
    },
  });
}
