# Mederi · Reserva visual de citas por WhatsApp

Fecha: 17 de noviembre de 2026.

## Resultado de la prueba

Se completó una conversación real por WhatsApp con listas de profesionales, fechas disponibles y horas, y botones de confirmación. Se comprobó en la base de la clínica demo una cita programada para el 20 de noviembre de 2026 a las 10:30. Para no alterar un paciente que ya tenía el teléfono real, la última prueba convirtió exclusivamente el remitente autorizado en un teléfono ficticio en el backend: la contestación se envió al WhatsApp real, pero la ficha y la cita quedaron asociadas al número ficticio. Esta traducción es una herramienta de prueba, no es el comportamiento previsto para clientes. El flujo `9c24c0a0d65e4adb` quedó despublicado y los servicios de prueba detenidos. No se eliminó la cita ficticia.

## Recomendación

Explorar WhatsApp Flows: una experiencia estructurada dentro de WhatsApp que reúna la selección de profesional, fecha, hora y confirmación en pantallas más claras. El ejemplo oficial de Meta para reservas y su documentación describen un endpoint que suministra información dinámica; habrá que validar los componentes y la apariencia exacta con la cuenta y los dispositivos de prueba. WhatsApp controla la presentación, por lo que el prototipo HTML no es una reproducción exacta.

Fuentes oficiales: [ejemplo y protocolo de endpoint](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/implementingyourflowendpoint), [herramientas y ejemplos de Flows](https://github.com/WhatsApp/WhatsApp-Flows-Tools), [mensajes interactivos](https://developers.facebook.com/docs/whatsapp/guides/interactive-messages/?locale=es_ES). Esta última guía está etiquetada para la API local retirada; sirve como referencia de interacción, no como prueba de las capacidades actuales de todos los clientes Cloud.

## Experiencia propuesta

1. Mensaje inicial con un botón «Reservar cita». Si la clínica tiene un único profesional disponible, preseleccionarlo cuando sea inequívoco; si hay varios, permitir elegir uno o «el primero disponible» si se implementa y prueba esa búsqueda.
2. Mostrar un calendario o selector compatible con Flows, con solo días disponibles, y después horas realmente disponibles. Consultar Mederi al cambiar fecha y al confirmar; si alguien ocupa un hueco entre ambos momentos, ofrecer alternativas.
3. Pedir el nombre completo una sola vez. Para los pacientes nuevos, recoger fecha de nacimiento mediante controles de selección. Mederi requiere actualmente nombre, apellidos y fecha de nacimiento tanto en su DTO de alta como en la entidad; no inventar valores. La división de un nombre completo en nombre y apellidos puede ser ambigua: resolverla mediante una confirmación editable o adaptar el modelo explícitamente antes de utilizarla.
4. Resumir profesional, fecha y hora con un botón «Confirmar cita». Confirmar al usuario solo cuando Mederi haya creado la cita; la aceptación del mensaje por Meta es un estado distinto.
5. Para una persona con número ya existente, evitar enseñar datos privados o vincular una ficha basándose solo en el número. Diseñar una comprobación de identidad adecuada; si hay varias coincidencias o discrepancias, derivar a recepción sin crear duplicados.
6. Si Flows no está disponible para el usuario o falla, conservar listas y botones como alternativa. No dar por supuesta la compatibilidad en todas las versiones de WhatsApp sin ensayarla.

## Trabajo técnico para llevarlo a la demo

- Crear un Flow de prueba independiente en la cuenta Meta demo y validar sus pantallas en el constructor y en dispositivos reales. Comprobar qué componentes están disponibles para la cuenta concreta y cómo se muestra el selector de fecha de nacimiento.
- Desarrollar un endpoint HTTPS separado para Flows con intercambio cifrado, comprobación de firma, control de estado y token ligado a la clínica, remitente y sesión; gestionar claves específicas de la cuenta de prueba. No reutilizar el webhook de AquaFisio.
- Consultar profesionales y disponibilidad en Mederi bajo las mismas restricciones de clínica; no confiar en IDs o fechas enviados por el cliente y mantener la comprobación de solapamientos, bloqueo e idempotencia al crear la cita.
- Resolver la identificación y los nombres compuestos sin suposiciones silenciosas. Si se quisiera permitir una reserva sin fecha de nacimiento, primero diseñar un modelo de solicitud provisional o un cambio explícito de datos y revisar sus efectos; no usar una fecha inventada.
- Probar éxito, hueco ocupado, repetición, confirmación antigua, dos envíos concurrentes, otros remitentes y otras clínicas, reconexión y entrega incierta. Probar la experiencia real móvil antes de afirmar que está lista.
- Para uso con pacientes reales faltan política de privacidad y configuración del canal de producción; la demo limitada funcionó sin publicarla. No publicar datos ficticios como política real.

## Prototipo

Abrir `docs/prototipo-whatsapp-citas.html`. Es una simulación local, con opciones y nombres de ejemplo, que no envía datos ni crea reservas. Representa la dirección visual, no una implementación de Meta ni una garantía de sus posibilidades exactas de marca.


## Primer borrador técnico de Flows

El diseño fue bien recibido por el usuario. Se preparó `docs/mederi-whatsapp-flows-borrador.json` como simulación local de cinco pantallas con Flow JSON 7.3: profesional, calendario, horario, nombre y fecha de nacimiento, y cierre. Las opciones son ficticias; el borrador no está conectado a Mederi y no reserva nada. Se ha comprobado que el archivo es JSON válido, pero Meta aún no ha validado su esquema ni se ha probado en un dispositivo; puede requerir ajustes en su constructor. No debe publicarse ni enviarse como reserva funcional.

La [documentación oficial de Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/components) describe `CalendarPicker`, `DatePicker` y opciones seleccionables; el [registro de versiones](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/changelogs) recomienda Flow JSON 7.3 y Data API 4.0 para Flows con endpoint. El diseño definitivo necesita datos dinámicos, cifrado y validación del servidor; una maqueta estática no demuestra ninguna de esas capacidades. El mismo registro indica que Meta comenzó el despliegue de Flows en WhatsApp Web en diciembre de 2025: comprobar compatibilidad efectiva en los dispositivos usados, en lugar de afirmar que Web está excluido.


## Validación de la demo dinámica (17 de noviembre de 2026)

Se creó el Flow borrador de Meta `1818531055964877` con el JSON dinámico `mederi-whatsapp-flows-dinamico.json`. El editor informó de cero errores y Meta completó la comprobación de salud del endpoint cifrado. La clave pública registrada para el número de prueba figura como válida. El endpoint temporal requiere volver a configurarse cuando se reinicie su túnel.

El backend aislado de la release `f5f4eedbeea2ca34b1c7f5d531da653f26bb8e5e` consulta los profesionales, fechas y huecos de la clínica demo. Una prueba técnica firmada y cifrada recorrió el endpoint y creó una cita de prueba en la base demo para el 18 de noviembre a las 09:00 (hora de Madrid), con el teléfono ficticio autorizado. Repetir la confirmación devolvió la misma referencia. Esto no valida la experiencia móvil ni la identificación de pacientes reales.

El flujo n8n [Mederi DEMO · Flow visual](https://n8n.veraniacloud.com/workflow/4b03cbccdad743d8) quedó despublicado: Meta rechazó un envío directo de prueba con `139000: Blocked by Integrity`. El estado de salud también indica empresa no verificada y un problema de pago en la cuenta, sin identificar cuál causa el rechazo concreto. Los recibos de entrega incierta no deben reenviarse automáticamente. El formulario continúa como borrador y no se ha completado una reserva real desde el móvil.

El centro de seguridad del porfolio Agencia Eiduo indica que cumple los requisitos para iniciar la verificación; el asistente muestra «Jose Luis Sánchez García» y solicita tipo de empresa, datos de contacto y, posiblemente, documentos. Queda pendiente confirmar la identidad y forma jurídica correctas antes de presentar datos. La privacidad ficticia sigue siendo solo un borrador.

El 17 de noviembre, el usuario presentó los datos para la verificación. El Centro de seguridad de Meta muestra «En revisión» para Eiduo y estima aproximadamente dos días laborables. La aprobación y la eliminación del rechazo 139000 siguen pendientes de comprobarse; el aviso previo de pago también requiere revisión si persiste.

El 18 de noviembre se comprobó en el Centro de seguridad de Meta que Eiduo figura como «Verificada» desde el 17 de noviembre. Todavía no se ha repetido el envío del Flow: la credencial temporal de Meta necesita renovarse y la persona usuaria no está disponible ahora. La pasarela y el túnel siguen detenidos.

El 18 de noviembre se renovó la credencial y n8n confirmó la conexión. Meta validó de nuevo el endpoint cifrado; al enviar CITA desde el número autorizado, el mensaje llegó a n8n pero Meta rechazó el Flow con 139000 «Blocked by Integrity». En el Centro de seguridad, el caso de uso de WhatsApp dice «Se necesita más información» y recomienda iniciar conversaciones de alta calidad, aunque confirma que la empresa está verificada; no indica si es causa del rechazo. La cuenta de prueba había informado previamente de un problema de pago. Flujo n8n despublicado y servicios temporales detenidos tras la prueba.

## Aislamiento del error 139000

Se comprobó con el token de la cuenta de prueba que un mensaje de texto normal fue aceptado por Meta y el usuario confirmó su recepción. A continuación se creó un Flow de control estático, de una sola pantalla y sin endpoint, que obtuvo cero errores de validación y estado FLOW AVAILABLE. Su envío en modo borrador al mismo destinatario fue rechazado con HTTP 400 y código 139000. Se eliminó el borrador de control después de la prueba. Esto aísla el rechazo al envío de Flows bajo esta cuenta; no prueba que el aviso 141006 de pago sea la causa concreta. En la consulta, BUSINESS y APP figuraban AVAILABLE, el número CONNECTED y GREEN, y WABA figuraba BLOCKED con 141006. Como la demo estaba pausada, la aplicación no estaba suscrita al webhook y el endpoint dinámico aparecía inactivo; la comprobación de salud dinámica había sido correcta durante la prueba anterior.
## Comprobaciones adicionales de Meta

Graph API v25.0 y v27.0 coinciden. La cuenta de WhatsApp de prueba tiene revisión `APPROVED` y verificación `verified`. Ambas versiones devuelven `WABA BLOCKED` con `141006`, cuyo texto se refiere a conversaciones iniciadas por la empresa. La empresa y la aplicación figuran `AVAILABLE` para mensajería y el número de prueba sigue `CONNECTED`, con calidad `GREEN`. Los códigos `138024` y `138025` del número y la aplicación corresponden a llamadas SIP. La aplicación de la demo figura entre las suscritas a la cuenta. Esta consulta no verifica que el webhook de n8n esté escuchando.

Meta genera una vista previa del Flow original, con cero errores de validación. El endpoint temporal está apagado y su estado actual refleja esa pausa. La consulta a las configuraciones de pago de la cuenta fue rechazada por permisos y no permitió comprobarlas. El `141006` es el único código explícito de bloqueo a nivel de la cuenta de prueba hallado en estas consultas. Sigue sin haber una correlación causal demostrada con `139000` al responder a un mensaje iniciado por el usuario.
