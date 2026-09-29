# Control de acceso y asistencia

MVP web en español para demostrar gestión de asistencia QR y operación básica multi-sede. No requiere dependencias de terceros: necesita Node.js para las pruebas y cualquier servidor HTTP estático para ejecutarse.

## Ejecutar

Desde la raíz del repositorio:

```sh
python3 -m http.server 8000
```

Abre <http://localhost:8000>. Para probar las reglas de asistencia:

```sh
npm test
```

El primer inicio carga 23 sedes y colaboradores ficticios de ejemplo. El estado se cifra en el dispositivo con AES-GCM y una clave no exportable de Web Crypto en IndexedDB; **no ingreses datos personales reales**, ya que esto no reemplaza la seguridad de un sistema productivo. Usa «Restaurar datos de muestra» para reemplazar la información local. Después de la primera visita, el navegador guarda en caché los archivos de la aplicación para volver a abrirla sin conexión. El escáner QR requiere permiso de cámara y un navegador con `BarcodeDetector`; el contenido del QR debe ser el identificador del colaborador, por ejemplo `E0001`. Si el lector no está disponible, la marcación manual sigue funcionando.

## Funcionalidad del MVP

- Tablero del día con actividad por sede y ranking de llegadas tarde.
- Registro de entrada/salida, validación de orden, estado activo y horario; conserva la hora del dispositivo y en modo sin conexión marca el registro como pendiente. La aplicación puede cargarse desde caché, pero no hay sincronización remota.
- Directorio con altas/bajas, sede, modalidad y hora de inicio; configuración individual de hora de inicio.
- Registro y aprobación de novedades; admite seleccionar un soporte PDF, pero en esta demostración solo se conserva su nombre local.
- Exportación de marcaciones CSV y vista de impresión que puede guardarse como PDF desde el navegador.
- Vistas de muestra de administrador, jefatura y colaborador, con ayuda integrada.

## Límites y requisitos para producción

Esta aplicación es un prototipo local, no un sistema de producción. Los selectores de perfil solo cambian la vista: no implementan autenticación ni controles de acceso seguros. No hay servidor, cifrado de datos, auditoría, respaldo, sincronización remota offline, geolocalización, notificaciones programadas, cálculo de horas extras, liquidación de nómina ni integración con Defontana. Los registros pendientes permanecen en el navegador y no se sincronizan automáticamente. Para operar con colaboradores reales se necesita desplegar una API y una base de datos seguras, configurar los roles y permisos en el servidor y desarrollar las integraciones y reglas laborales antes de cargar datos personales.
