import { API_URL } from "@/lib/api";
import { getSessionToken } from "@/lib/session";

// Same "bridge the httpOnly cookie to an Authorization header and stream
// the binary straight back" shape as /patients/export's Route Handler —
// apiFetch's JSON-only contract can't express a PDF download.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const token = await getSessionToken();

  const upstream = await fetch(`${API_URL}/patients/${id}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("No se pudo generar el PDF de la ficha.", {
      status: upstream.status || 500,
    });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/pdf",
      "Content-Disposition": upstream.headers.get("content-disposition") ?? "attachment",
    },
  });
}
