# Copias B2 y recuperación por clínica

Estado: integrado en la aplicación local. El panel está en `/platform/backups` dentro de superadmin. La configuración, ejecución automática y manual, historial, retención y restauración selectiva están implementados.

## Configuración de Backblaze B2

El panel pide:

- Nombre del bucket privado.
- Región S3 de B2, por ejemplo `eu-central-003`.
- ID y clave de una clave de aplicación limitada a ese bucket.

Al guardar, la aplicación comprueba listado, escritura, lectura y borrado de un objeto temporal antes de sustituir la configuración vigente. La comprobación de estado posterior verifica que el bucket siga siendo accesible. Las dos claves se guardan cifradas con una clave derivada de `JWT_SECRET`; las claves originales no vuelven a mostrarse. El usuario y la contraseña maestra de Backblaze no se deben introducir.

La clave derivada de `JWT_SECRET` cifra también los archivos de copia. Hay que conservar ese secreto de forma segura y estable; cambiarlo o perderlo hace ilegibles las copias existentes y las credenciales B2 guardadas. Mantener el bucket privado y custodiar el secreto fuera del propio bucket.

## Ejecución y retención

- Se genera una copia diaria a las 02:30, hora de Madrid. Si el servicio arranca después de esa hora, intenta recuperar la copia del día. Las ejecuciones diarias fallidas se reintentan con un límite para no repetir indefinidamente.
- El botón **Crear copia ahora** lanza una copia manual de todas las clínicas.
- Cada clínica se guarda en un artefacto independiente cifrado y autenticado antes de subirlo. La copia contiene las filas de sus tablas con `tenant_id`, los datos de la clínica y sus adjuntos.
- El historial se conserva durante 30 días; al vencer, la aplicación borra los objetos de B2 y sus registros locales.
- El panel muestra clínica, fecha, tipo de ejecución, tamaño y estado. Los fallos también aparecen en el historial; todavía no se envían alertas externas.

En buckets con versionado, un borrado S3 puede ocultar la versión actual sin liberar de inmediato las versiones anteriores. Configura en B2 una regla de ciclo de vida acorde con los 30 días para expirar versiones antiguas; la aplicación no modifica las reglas del bucket.

## Restauración selectiva

La acción **Restaurar esta clínica** solicita escribir el nombre mostrado. Antes de aplicar la copia, crea y verifica otra copia de la clínica actual. La restauración comprueba el hash, la autenticidad, el formato, la clínica y los adjuntos; prepara los archivos y aplica las filas en una transacción serializable. Un bloqueo por clínica detiene escrituras de esa clínica mientras se restaura. Las demás clínicas siguen disponibles.

La restauración incluye los usuarios, la configuración y los datos de la clínica cubiertos por tablas con `tenant_id`, además de los adjuntos. No reemplaza información global compartida, como el perfil acreedor y el certificado de firma. Los intentos de recordatorios de WhatsApp se conservan para que recuperar una copia antigua no vuelva a enviar recordatorios ya procesados. Tras la restauración, revisa el estado de integraciones externas: una copia no puede deshacer mensajes ni cambios realizados fuera de la aplicación.

La restauración puede fallar si el esquema actual exige campos que no existen en la copia o si hay conflictos de unicidad, por ejemplo un correo que ya se usa fuera de la clínica restaurada. En ese caso, la transacción deja intactas las filas actuales y el panel registra el fallo.

## Prueba local

1. Inicia la API local en `localhost:3000` y la web en `localhost:3001`.
2. Entra con una cuenta superadmin y abre `http://localhost:3001/platform/backups`.
3. Introduce los cuatro campos B2 y pulsa **Comprobar y guardar**. Las claves deben permitir listar, escribir, leer y borrar objetos en el bucket.
4. Pulsa **Crear copia ahora** y comprueba que aparezca un artefacto completado por clínica.
5. Para una prueba real de restauración, usa una clínica y datos de prueba: la confirmación reemplaza todos sus datos con los de la fecha elegida, después de guardar una copia previa.

La primera ejecución diaria de desarrollo subió cuatro artefactos a B2. El panel se desplegó en PRO el 19-11-2026 y se aplicaron las migraciones `BackupConfiguration1737800000000` y `BackupHistory1737900000000`. La configuración B2 de PRO quedó vacía para que las claves se introduzcan desde superadmin; las copias automáticas empezarán cuando se guarde esa configuración.
