import { API_URL } from "@/lib/api";
import { clientHeaders } from "@/lib/client-headers";

// The document the clinic owner reviews (and, once signed, their signed
// copy). No session on this route: the token in the URL is the credential,
// checked by the API. Same stream-the-binary-back shape as the other PDF
// route handlers, minus the cookie bridge.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;

  const upstream = await fetch(`${API_URL}/public/sepa/${encodeURIComponent(token)}/pdf`, {
    headers: await clientHeaders(),
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("No se pudo cargar el documento.", {
      status: upstream.status || 500,
    });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/pdf",
      "Content-Disposition": upstream.headers.get("content-disposition") ?? "inline",
      "Cache-Control": "no-store",
    },
  });
}
