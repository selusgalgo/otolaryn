# Mejoras graduales de Mederi

Fecha: 20 de noviembre de 2026.

## Alcance y conclusión

Revisión estática del código local de navegación, inicio, pacientes, agenda, formularios, consultas, borradores y actividad de WhatsApp. No se ha comprobado la aplicación autenticada en producción ni observado a usuarios. Los cambios locales preexistentes pueden diferir de lo desplegado. No se ha modificado código funcional ni desplegado nada.

Recomendación: avanzar con mejoras pequeñas de comprensión, seguridad al guardar y continuidad del trabajo. Mantener el menú, la disposición general y las rutas habituales. Las propuestas son hipótesis de producto basadas en el código; su efecto debe validarse con usuarios.

## Lo que conviene conservar

- Navegación corta: Inicio, Pacientes y Agenda; Usuarios para administración.
- Creación de citas desde un diálogo, sin abandonar la agenda, y desde la ficha del paciente.
- Sugerencias de horarios libres y duración predeterminada por clínica.
- Selección de pacientes con documento y teléfonos para distinguir nombres similares.
- Borradores de consulta locales y en servidor, recuperación y listado de pendientes.
- Acciones y datos adaptados al rol; confirmaciones que explican cancelar frente a eliminar.
- Vistas de día, semana y mes, con acceso a Hoy.

## Prioridades

El beneficio, esfuerzo e impacto de adaptación son estimaciones cualitativas, no métricas observadas ni presupuestos.

| Orden | Propuesta | Evidencia y utilidad | Esfuerzo estimado | Adaptación |
|---|---|---|---|---|
| 1 | Acceder a todas las consultas | La ficha solicita `pageSize=50` y presenta `entries.data` sin paginación. Añadir «Ver consultas anteriores» y contador, conservando la tabla. Probar con más de 50 entradas. | Bajo/medio | Muy baja |
| 2 | Confirmaciones visibles al guardar | Formularios de paciente, notas y citas cierran la edición o el diálogo al recibir éxito. Añadir confirmación breve junto al área utilizada; en citas, identificar paciente, día y hora. Mostrarla solo tras respuesta correcta del servidor. | Bajo | Muy baja |
| 3 | Protección al abandonar una edición | En los formularios de paciente, notas y citas revisados no aparece una protección de cambios pendientes. Avisar solo cuando haya cambios al cerrar o navegar; conservar valores ante error. Mantener los mecanismos existentes de borradores clínicos. | Medio | Baja |
| 4 | Errores junto al campo afectado | Paciente y cita muestran un mensaje general al final. Resaltar el campo concreto, explicar cómo corregirlo y llevar el foco al primero que falle. No exigir nuevos pasos al guardar correctamente. | Medio | Muy baja |
| 5 | Aclarar acciones con iconos | `RowActions` presenta hasta tres acciones solo con iconos y texto al pasar el ratón. Añadir texto visible a la acción más frecuente, empezando por una pantalla. Mantener la ubicación. | Bajo | Baja |
| 6 | Resolver el control de foto sin función | La ficha presenta «Añadir foto» sin manejador de acción ni almacenamiento asociado. Ocultarlo hasta que funcione o explicar su indisponibilidad si debe seguir visible. No implantar fotos solo para justificar el botón. | Bajo | Muy baja |
| 7 | Reforzar el seguimiento de borradores | Ya hay autoguardado, avisos de caducidad y listado de pendientes. El plazo es de 10 días sin cambios y hay purga. Mejorar acceso a los próximos a caducar y revisar con responsables si ese plazo encaja con el trabajo real. No cambiar la conservación automáticamente. | Bajo para avisos; mayor para cambiar el ciclo | Baja |
| 8 | Hacer comprensible WhatsApp para recepción | Actividad muestra reservas, cambios, cancelaciones e incidencias; usa términos como «Aceptado por Meta» y no presenta nombre del paciente en sus filas. Añadir identidad de la cita y próximo paso. Distinguir aceptación del proveedor de entrega o confirmación del paciente. | Medio | Baja |

## Funciones nuevas que probaría después

1. **Lista de espera sencilla**, si recepción gestiona peticiones de adelanto: paciente, disponibilidad y nota. Al cancelar una cita, ofrecer consultar candidatos. El personal decide a quién llamar; no reservar ni enviar mensajes automáticamente en la primera versión.
2. **Acción «Ha llegado»**, si hoy recepción avisa verbalmente al profesional. Añadir una marca en la cita y un indicador discreto en la agenda, manteniendo los estados y vistas habituales. Requiere definir cómo se relaciona con atendida, cancelada y no presentado.
3. **Aviso de posible paciente duplicado antes del alta**, complementando el control existente por documento. Mostrar coincidencias y permitir revisar la ficha antes de crear. Un teléfono compartido por familiares no debe bloquear un alta ni provocar una fusión automática.

Estas funciones requieren confirmar que el problema existe y se repite. No introduciría las tres de una vez.

## Forma de introducir los cambios

- Primera entrega: acceso a consultas anteriores, confirmaciones y resolución del botón de foto.
- Segunda entrega: protección de cambios y errores por campo.
- Tercera entrega: texto en una acción frecuente y mejora de actividad de WhatsApp, si se usa.
- Después, pilotar una sola función nueva en una clínica o con un grupo pequeño.
- Conservar nombres, posiciones y comportamiento de las acciones conocidas. Evitar reordenar pantallas, rediseñar el menú o introducir un recorrido obligatorio de bienvenida.
- Acompañar cada entrega de una nota breve y una captura del cambio concreto.

## Validación antes de ampliar

Observar a una persona de recepción y un profesional realizando tareas con datos de prueba: buscar un paciente, crear y cambiar una cita, corregir un dato, guardar y recuperar una consulta, y abrir una consulta anterior a las primeras 50.

Registrar primero una referencia: tiempo, solicitudes de ayuda, errores de selección y dudas sobre si se ha guardado. Repetir después del cambio. Mantener la mejora si reduce errores o dudas sin dificultar las tareas habituales. No considerar este análisis una aceptación visual ni una auditoría clínica, legal o de seguridad.

## Fuentes del repositorio

- `web/src/components/layout/sidebar.tsx`: navegación y permisos de presentación.
- `web/src/app/(app)/dashboard/page.tsx`: inicio y borradores pendientes.
- `web/src/app/(app)/patients/[id]/page.tsx`: límite de 50 consultas y tabla sin navegación de páginas.
- `web/src/components/patients/patient-profile-section.tsx`: edición y controles de foto.
- `web/src/components/patients/patient-notes-card.tsx`: guardado de notas.
- `web/src/components/patients/patient-form.tsx`: campos y presentación de errores.
- `web/src/components/appointments/new-appointment-dialog.tsx`: alta sin salir de la agenda.
- `web/src/components/appointments/appointment-form.tsx`: horarios sugeridos, errores y edición de estado.
- `web/src/components/appointments/patient-picker.tsx`: búsqueda y alta desde citas.
- `web/src/components/appointments/appointment-row-actions.tsx`: editar, cancelar y eliminar.
- `web/src/components/ui/row-actions.tsx`: acciones mediante iconos.
- `web/src/components/clinical-entries/clinical-entry-form.tsx`: borradores y mensajes de guardado.
- `src/clinical-entries/clinical-entry-draft.util.ts`: plazo de 10 días.
- `src/clinical-entries/clinical-entry-drafts-purge.service.ts`: eliminación de borradores caducados.
- `src/patients/patients.service.ts`: búsqueda y control de conflictos por documento.
- `web/src/app/(app)/appointments/whatsapp/page.tsx`: actividad y estados de envío.

Criterio general de usabilidad: [Nielsen Norman Group, 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/), especialmente visibilidad del estado, consistencia, prevención de errores y reconocimiento de acciones. Esta fuente respalda el criterio de evaluación, no demuestra resultados en Mederi.
