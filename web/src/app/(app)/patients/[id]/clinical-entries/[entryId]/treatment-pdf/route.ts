import { API_URL } from "@/lib/api";
import { getSessionToken } from "@/lib/session";

// Same bridging shape as /patients/[id]/pdf — the [id] patient segment in
// the URL is only there for the page hierarchy (and isn't even read here);
// the backend resolves everything it needs from entryId alone.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entryId: string }> },
): Promise<Response> {
  const { entryId } = await params;
  const token = await getSessionToken();

  const upstream = await fetch(`${API_URL}/clinical-entries/${entryId}/treatment-pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("No se pudo generar el PDF del tratamiento.", {
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
