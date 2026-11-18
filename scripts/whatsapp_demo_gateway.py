"""Optional local gateway for a future, explicitly approved demo tunnel.

The gateway exposes only the three messaging endpoints of the disposable
local instance. It does not create a tunnel or activate a WhatsApp workflow.
"""

import hmac
import http.client
import hashlib
import ipaddress
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = os.environ.get("WHATSAPP_GATEWAY_BIND", "127.0.0.1")
PORT = int(os.environ.get("WHATSAPP_GATEWAY_PORT", "3114"))
BACKEND_PORT = int(os.environ.get("WHATSAPP_GATEWAY_BACKEND_PORT", "3111"))
address = ipaddress.ip_address(HOST)
if address.version != 4 or not (address.is_loopback or address.is_private) or address.is_unspecified:
    raise RuntimeError("La pasarela requiere una dirección IPv4 privada concreta")
if not (1 <= PORT <= 65535 and 1 <= BACKEND_PORT <= 65535):
    raise RuntimeError("Puerto de pasarela o backend no válido")
allowed_client = os.environ.get("WHATSAPP_GATEWAY_ALLOWED_CLIENT", "")
if allowed_client:
    client_address = ipaddress.ip_address(allowed_client)
    if client_address.version != 4 or client_address.is_unspecified or not client_address.is_private:
        raise RuntimeError("El cliente autorizado debe ser una dirección IPv4 privada")
elif not address.is_loopback:
    raise RuntimeError("Una pasarela de red requiere un cliente autorizado")
PATHS = frozenset({
    "/integrations/whatsapp-booking/messages",
    "/integrations/whatsapp-booking/delivery/claim",
    "/integrations/whatsapp-booking/delivery/result",
})
BACKEND_TOKEN = Path(os.environ.get("WHATSAPP_GATEWAY_BACKEND_TOKEN_FILE", "/tmp/mederi-whatsapp-local/token")).read_text().strip()
GATEWAY_DIGEST = Path(os.environ.get("WHATSAPP_GATEWAY_DIGEST_FILE", "/tmp/mederi-whatsapp-local/gateway-token.sha256")).read_text().strip()
if len(GATEWAY_DIGEST) != 64 or any(c not in "0123456789abcdef" for c in GATEWAY_DIGEST):
    raise RuntimeError("La huella de la clave de la pasarela no es válida")
if hmac.compare_digest(GATEWAY_DIGEST, hashlib.sha256(BACKEND_TOKEN.encode()).hexdigest()):
    raise RuntimeError("La clave de la pasarela debe ser independiente")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_POST(self):
        if allowed_client and self.client_address[0] != allowed_client:
            self.send_error(403)
            return
        authorization = self.headers.get("Authorization", "")
        bearer = authorization.removeprefix("Bearer ") if authorization.startswith("Bearer ") else ""
        if self.path not in PATHS or not re.fullmatch(r"[A-Za-z0-9_-]{43,128}", bearer) or not hmac.compare_digest(
            hashlib.sha256(bearer.encode()).hexdigest(), GATEWAY_DIGEST
        ):
            self.send_error(401)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length < 1 or length > 4096 or self.headers.get_content_type() != "application/json":
            self.send_error(400)
            return
        connection = http.client.HTTPConnection("127.0.0.1", BACKEND_PORT, timeout=25)
        try:
            connection.request("POST", self.path, self.rfile.read(length), {
                "Authorization": f"Bearer {BACKEND_TOKEN}", "Content-Type": "application/json",
            })
            response = connection.getresponse()
            body = response.read()
            self.send_response(response.status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except (OSError, http.client.HTTPException):
            self.send_error(502)
        finally:
            connection.close()


if __name__ == "__main__":
    print(f"Pasarela de prueba local: http://{HOST}:{PORT}", flush=True)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    # Even if the operator leaves the tunnel running, the local service stops
    # accepting requests after one hour and must be started deliberately again.
    expiry = threading.Timer(3600, server.shutdown)
    expiry.daemon = True
    expiry.start()
    try:
        server.serve_forever()
    finally:
        expiry.cancel()
        server.server_close()
