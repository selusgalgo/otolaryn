"""Local-only chat simulator for the isolated Mederi/n8n demo.

Reads the disposable local secret from /tmp; never listens on a public address.
The n8n workflow uses a fictitious phone and does not send WhatsApp messages.
"""

import hmac
import itertools
import json
import secrets
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "127.0.0.1"
PORT = 3113
ORIGIN = f"http://{HOST}:{PORT}"
WEBHOOK = "http://127.0.0.1:5679/webhook/mederi-demo-local"
TOKEN = Path("/tmp/mederi-whatsapp-local/token").read_text().strip()
CSRF = secrets.token_urlsafe(32)
DEMO_PHONES = [f"+34600000{number:03d}" for number in range(990, 998)] + ["+34600000999"]
PHONE_CYCLE = itertools.cycle(DEMO_PHONES)

PAGE = """<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prueba local de citas</title><style>
body{font:16px system-ui;background:#f1f5f4;color:#18332b;margin:0} main{max-width:680px;margin:40px auto;padding:24px}
h1{font-size:1.6rem} .card{background:white;border-radius:14px;padding:20px;box-shadow:0 3px 18px #0001}
#chat{height:380px;overflow:auto;border:1px solid #d9e6df;border-radius:10px;padding:14px;white-space:pre-wrap}
.msg{margin:0 0 12px;padding:10px 12px;border-radius:10px;max-width:85%;background:#eaf4ee}.user{margin-left:auto;background:#d4eddb}
form{display:flex;gap:8px;margin-top:12px}input{flex:1;padding:12px;border:1px solid #8ca99b;border-radius:8px;font-size:1rem;min-width:0}
button{background:#176d4e;color:white;border:0;border-radius:8px;padding:12px 20px;font-size:1rem;cursor:pointer}button:disabled{opacity:.6}
</style></head><body><main><h1>Prueba local de citas</h1>
<p>Conversación simulada con datos ficticios. No envía mensajes de WhatsApp.</p>
<div class="card"><div id="chat" role="log" aria-live="polite"></div>
<form id="form"><label for="message" class="label">Mensaje</label><input id="message" maxlength="500" required autocomplete="off"><button id="send">Enviar</button></form>
<p>Escribe <strong>CITA</strong> para comenzar o <strong>CANCELAR</strong> para reiniciar. Para probar con otra persona ficticia, recarga la página.</p></div></main>
<script>
const chat=document.getElementById('chat'), form=document.getElementById('form'), input=document.getElementById('message'), button=document.getElementById('send');
function show(text,user=false){const p=document.createElement('div');p.className='msg'+(user?' user':'');p.textContent=text;chat.appendChild(p);chat.scrollTop=chat.scrollHeight;}
show('Hola. Escribe CITA para iniciar la prueba.');
form.addEventListener('submit',async e=>{e.preventDefault();const text=input.value.trim();if(!text)return;show(text,true);input.value='';button.disabled=true;
try{const response=await fetch('/message',{method:'POST',headers:{'Content-Type':'application/json','X-Local-CSRF':'__CSRF__'},body:JSON.stringify({text,phone:'__PHONE__'})});const data=await response.json();show(data.reply||data.error||'No se ha recibido respuesta.');}
catch{show('No se ha podido conectar con la prueba local.');}finally{button.disabled=false;input.focus();}});
</script></body></html>""".replace("__CSRF__", CSRF)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def _send(self, status, body, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != "/":
            self._send(404, b"Not found", "text/plain")
            return
        self._send(200, PAGE.replace("__PHONE__", next(PHONE_CYCLE)).encode(), "text/html; charset=utf-8")

    def do_POST(self):
        if (self.path != "/message" or self.headers.get("Origin") != ORIGIN or
                not hmac.compare_digest(self.headers.get("X-Local-CSRF", ""), CSRF) or
                self.headers.get("Content-Type") != "application/json"):
            self._send(403, b'{"error":"Solicitud no autorizada"}', "application/json")
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 4096:
                raise ValueError("invalid length")
            data = json.loads(self.rfile.read(length))
            text = data.get("text")
            phone = data.get("phone")
            if not isinstance(text, str) or not text.strip() or len(text) > 500 or phone not in DEMO_PHONES:
                raise ValueError("invalid message")
            body = json.dumps({"messageId": f"chat-local-{uuid.uuid4()}", "text": text.strip(), "phone": phone}).encode()
            request = urllib.request.Request(WEBHOOK, data=body, method="POST", headers={
                "Content-Type": "application/json", "X-Mederi-Local-Key": TOKEN,
            })
            with urllib.request.urlopen(request, timeout=30) as response:
                result = json.loads(response.read())
            if not isinstance(result.get("reply"), str):
                raise ValueError("invalid response")
            self._send(200, json.dumps({"reply": result["reply"]}, ensure_ascii=False).encode(), "application/json; charset=utf-8")
        except (ValueError, json.JSONDecodeError, urllib.error.URLError, TimeoutError):
            self._send(502, b'{"error":"No se ha podido procesar el mensaje en el entorno local."}', "application/json")


if __name__ == "__main__":
    print(f"Prueba local: {ORIGIN}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
