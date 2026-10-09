# Roda · GB Studio

Abrí Roda en https://gbstudio.com.ar/roda/. Usa la cuenta de Google y los proyectos de GB Studio: elegí un cliente y un proyecto y tocá **Crear Roda**. El nombre, cliente y portada pertenecen al mismo proyecto usado por las demás apps. El editor conserva breakdown, jornadas, planes, equipo, shotlist y reportes; su interfaz usa negro, blanco y grises.

Los datos de Roda se guardan juntos dentro del proyecto del estudio. Los permisos se comprueban en el servidor, incluidas las cuentas de solo lectura y el vencimiento de la prueba. Antes de volver a Proyectos se terminan de guardar los cambios pendientes.

La distribución integrada se copia en `roda/` del repositorio `GB-Films/GB-Studio` y se publica con su Hosting. `tests/studio-browser.cjs` comprueba el flujo con una sesión y servidor simulados; requiere Playwright, JSZip y `STUDIO_ROOT` apuntando al checkout de Studio. `node --test tests/screenplay.test.cjs` verifica el análisis de texto sin dependencias.

## Guion · 1.1.0

La sección **Guion** permite cargar PDF con texto seleccionable, DOCX, TXT o Fountain, o pegar el texto. Cada carga con cambios crea una actualización compartida con fecha, autor y origen. Las versiones anteriores se pueden consultar, descargar como texto y restaurar creando una nueva actualización. No se borran automáticamente. El texto del archivo se procesa en el navegador; la copia de guion se guarda en el proyecto con sus mismos permisos. Los PDF escaneados necesitan una copia con texto.

El desglose detecta encabezados INT./EXT., número, capítulo, interior/exterior, locación y momento. Propone personajes a partir de las líneas de diálogo y elementos presentes en el texto para las once categorías de producción. Las etiquetas explícitas, como `[Props: reloj antiguo]` o `[Extras: vecinos]`, permiten indicar elementos específicos. Las sugerencias requieren revisión. Al actualizar se mantienen los IDs de escena por capítulo y número, notas, planos, jornadas y elementos manuales. Las escenas ausentes en una nueva versión se conservan y se avisa para revisarlas.

**Google Docs** permite vincular un enlace editable y abrir el documento original con sus permisos. La importación usa el selector de Google y autorización `drive.file` para el documento elegido. Usa el proveedor de Google existente en Firebase, sin guardar tokens en el proyecto ni solicitar acceso a todos los documentos. Las APIs de Docs, Drive y Picker deben estar habilitadas en el proyecto de Google Cloud y la clave pública de Firebase debe permitir Picker y Drive. La edición sucede en Google Docs; **Importar últimos cambios** trae una copia, crea una actualización si cambió el texto y genera el desglose. No hay sincronización automática en segundo plano. La copia importada es visible para quienes tienen acceso al proyecto de Roda.

Los límites actuales protegen el guardado: 20 MB por archivo, 500 páginas por PDF, 250 KB de texto por carga y hasta 760 KB por parte de la instantánea del proyecto (el servidor admite 800 KB). Si una carga supera la capacidad disponible, se rechaza antes de modificar el proyecto y se conserva el historial. Las bibliotecas de lectura están distribuidas en `js/vendor/` con sus licencias: Mammoth 1.13.0 y PDF.js 6.4.299.

## Proyectos anteriores

Los proyectos del Firebase anterior se conservan en https://gb-films.github.io/RODA/?legacy=1. No se migran automáticamente ni se mezclan con los proyectos de Studio. La siguiente configuración corresponde a esa versión anterior.

App web estatica para organizar proyectos de produccion: breakdown, plan de rodaje, equipo, reportes, call sheets y shotlist.

## Backend

La app ya no depende de Jsonbin. Usa una capa `StorageLayer` con:

- Firestore como backend remoto.
- Fallback local con `localStorage` si Firebase no esta configurado o no hay conexion.
- Proyectos dinamicos: se pueden crear nuevos desde la sidebar.

## Configuracion Firebase

1. Crear un proyecto en Firebase.
2. Crear una Web App y copiar la config en `js/firebase-config.js`.
3. Crear Firestore Database.
4. Activar Firebase Authentication > Sign-in method > Anonymous, o ajustar las reglas.
5. Publicar reglas similares a `firebase.rules`.

Ver detalles en `docs/firebase.md`.
