# WhatsApp en producción (VPS Mederi) con el número de prueba

Estado a 2026-11-23: el flujo de reserva por texto funciona de extremo a extremo
con el número de prueba de Meta (`WHATSAPP_ONBOARDING_DEMO_PHONE_ID`).

## Cadena

Meta (app **Mederi Citas**, publicada) → webhook n8n → workflow
`Mederi · WhatsApp conexión autónoma` (`scripts/n8n/whatsapp-conexion-autonoma.json`)
→ pasarela privada `172.18.0.1:31093` (`mederi-whatsapp-demo-router.service`)
→ backend `POST /integrations/whatsapp-tenant-router/messages`
→ el router resuelve la clínica por `phone_number_id`, ejecuta la conversación y
**responde él mismo** a Meta con el token cifrado de la clínica.

n8n solo recibe, normaliza (filtra por `phone_number_id`) y reenvía.

## Piezas y ajustes hechos

| Pieza | Ajuste |
| --- | --- |
| Meta app | Publicada; icono, categoría y política de privacidad rellenos. Webhook `whatsapp_business_account` → URL del trigger del workflow n8n (campo `messages`). |
| Conexión de la clínica | Fila `ready` en `public.whatsapp_tenant_connections` (token cifrado con `WHATSAPP_CREDENTIAL_KEY`). Se crea con `scripts/register-whatsapp-test-connection.cjs <id credencial n8n>` en el VPS. |
| Pasarela | `WHATSAPP_GATEWAY_ALLOWED_CLIENT` debe ser la IP del contenedor `n8n` (`docker inspect n8n`), no la del task-runner. Tras cambiarla: `systemctl daemon-reload && systemctl restart mederi-whatsapp-demo-router`. |
| Backend `.env` | `WHATSAPP_BOOKING_DEMO_SHARED_PHONE=+34600000992,+34600000993`. Sin esto, los alias de demo chocan con pacientes demo existentes y la confirmación falla ("no he podido confirmar la cita"). |
| Remitentes | `WHATSAPP_ROUTER_DEMO_BINDINGS` (en `/etc/mederi/whatsapp-demo-signup.env`) asigna cada móvil real a un alias. Solo contestan los móviles listados. |
| n8n | Un solo workflow con WhatsApp Trigger activo a la vez: cada activación reescribe el callback de la app en Meta. Credencial de la pasarela: `Mederi DEMO · pasarela interna`. |

## Diagnóstico rápido

- Sin ejecuciones en n8n: comprobar que la app está publicada y que `GET /{app-id}/subscriptions` apunta al webhook del workflow activo.
- `ECONNREFUSED 172.18.0.1:31092`: el workflow apunta a la pasarela local antigua; usar el de `scripts/n8n/whatsapp-conexion-autonoma.json` (puerto 31093).
- `401` desde n8n a la pasarela: credencial `httpHeaderAuth` no coincide con `gateway.sha256`.
- `403`: IP del cliente no permitida, o remitente fuera de `WHATSAPP_ROUTER_DEMO_BINDINGS`.

## Pendiente

- Conectar el número real 614 23 17 15 por coexistencia: depende de la aprobación de Tech Provider (App Review) en Meta y de suscribir `smb_message_echoes`, `smb_app_state_sync` e `history`.
- Condiciones del servicio de la app Meta: apuntan a las de Google; poner las propias.
- WhatsApp Flows (pantallas en lugar de menús de texto): ver trabajo previo en `scripts/whatsapp-flow/`.
