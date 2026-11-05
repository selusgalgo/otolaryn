import { API_URL } from "@/lib/api";
import { getDeviceToken, getSessionToken } from "@/lib/session";

// Puente con GET /clinical-entry-attachments/:id/file, igual que treatment-pdf:
// el JWT vive en una cookie httpOnly que el navegador no puede mandar a la API.
// Los segmentos [id] y [entryId] solo dan jerarquía a la URL; la API resuelve
// todo (y comprueba quién puede verlo) con el id del adjunto.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
): Promise<Response> {
  const { attachmentId } = await params;
  const download = new URL(request.url).searchParams.get("download") === "1";
  const token = await getSessionToken();
  const deviceToken = await getDeviceToken();

  const upstream = await fetch(
    `${API_URL}/clinical-entry-attachments/${attachmentId}/file${download ? "?download=1" : ""}`,
    {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(deviceToken ? { "X-Device-Token": deviceToken } : {}),
      },
      cache: "no-store",
    },
  );

  if (!upstream.ok || !upstream.body) {
    return new Response("No se pudo abrir el archivo.", { status: upstream.status || 500 });
  }

  // Cabeceras de seguridad de la API (nosniff, CSP con sandbox) incluidas: el
  // archivo lo ha subido un usuario y nunca debe ejecutarse en nuestro origen.
  const headers = new Headers();
  for (const name of [
    "content-type",
    "content-disposition",
    "content-length",
    "x-content-type-options",
    "content-security-policy",
    "cache-control",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { headers });
}
