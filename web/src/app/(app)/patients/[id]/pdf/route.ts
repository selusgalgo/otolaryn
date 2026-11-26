import { API_URL } from "@/lib/api";
import { getDeviceToken, getSessionToken } from "@/lib/session";

// Same "bridge the httpOnly cookie to an Authorization header and stream
// the binary straight back" shape as /patients/export's Route Handler —
// apiFetch's JSON-only contract can't express a PDF download.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const token = await getSessionToken();
  const deviceToken = await getDeviceToken();

  // Bloques elegidos en el diálogo de "Imprimir" (?sections=datos,consultas...);
  // la API ignora los desconocidos y sin ninguno imprime la ficha completa.
  const sections = new URL(request.url).searchParams.get("sections");
  const query = sections ? `?sections=${encodeURIComponent(sections)}` : "";
  const upstream = await fetch(`${API_URL}/patients/${id}/pdf${query}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Sin esto, en una clínica con bloqueo de dispositivo la API rechaza
      // la descarga (401) aunque la sesión sea válida — igual que apiFetch.
      ...(deviceToken ? { "X-Device-Token": deviceToken } : {}),
    },
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
      "Content-Disposition":
        upstream.headers.get("content-disposition") ?? "attachment",
    },
  });
}
