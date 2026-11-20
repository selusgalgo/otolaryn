# Consulta técnica para Meta: bloqueo 139000 en WhatsApp Flows de prueba

**Aplicación:** Mederi DEMO Citas (ID 1876364476826650)  
**Cuenta de mensajería de prueba:** 1386860923626384  
**Número de prueba (ID):** 1262575040283464  
**Flow en borrador:** 1818531055964877

Al responder a un mensaje iniciado por un destinatario autorizado de prueba, el envío de un WhatsApp Flow en modo `draft` falla con HTTP 400, código `139000`, «Blocked by Integrity / Integrity requirements not met». El mismo problema persiste después de verificar el negocio.

El editor del Flow muestra cero errores de validación. La aplicación y el negocio figuran como disponibles en la API; el número de prueba está CONNECTED y su calidad es GREEN. Durante la prueba del 18 de noviembre, la comprobación cifrada de salud del endpoint fue satisfactoria y el token de la cuenta se comprobó correctamente. El endpoint temporal y la suscripción de webhook están detenidos actualmente, por lo que sus estados actuales pueden diferir de los observados durante la prueba.

La API indica `141006` en la cuenta de prueba y menciona un problema de método de pago que bloquearía conversaciones iniciadas por la empresa. La prueba descrita fue iniciada por el usuario y la documentación de Meta dice que las cuentas y números de prueba no necesitan un método de pago para enviar mensajes de plantilla. El centro de seguridad para WhatsApp también muestra «Se necesita más información» y recomienda conversaciones de alta calidad, pero no identifica un requisito específico de Flows.

¿Podéis indicar qué requisito de integridad concreto está incumplido para enviar el Flow en modo borrador con esta cuenta de prueba, si el aviso 141006 se aplica a este envío, y qué pasos permiten desbloquear las pruebas sin configurar facturación ni utilizar números o cuentas de producción?

No se incluyen tokens, información clínica ni números de destinatarios.
