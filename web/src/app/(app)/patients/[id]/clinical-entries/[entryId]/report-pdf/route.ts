import { API_URL } from "@/lib/api";
import { getDeviceToken, getSessionToken } from "@/lib/session";

// Informe médico de una consulta (plantilla de cirugía) — same bridging
// shape as ../treatment-pdf/route.ts.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entryId: string }> },
): Promise<Response> {
  const { entryId } = await params;
  const token = await getSessionToken();
  const deviceToken = await getDeviceToken();

  const upstream = await fetch(`${API_URL}/clinical-entries/${entryId}/report-pdf`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(deviceToken ? { "X-Device-Token": deviceToken } : {}),
    },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("No se pudo generar el PDF del informe.", {
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
