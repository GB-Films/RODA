# Roda · GB Studio

Abrí Roda en https://gbstudio.com.ar/roda/. Usa la cuenta de Google y los proyectos de GB Studio: elegí un cliente y un proyecto y tocá **Crear Roda**. El nombre, cliente y portada pertenecen al mismo proyecto usado por las demás apps. El editor conserva breakdown, jornadas, planes, equipo, shotlist y reportes; su interfaz usa negro, blanco y grises.

Los datos de Roda se guardan juntos dentro del proyecto del estudio. Los permisos se comprueban en el servidor, incluidas las cuentas de solo lectura y el vencimiento de la prueba. Antes de volver a Proyectos se terminan de guardar los cambios pendientes.

La distribución integrada se copia en `roda/` del repositorio `GB-Films/GB-Studio` y se publica con su Hosting. `tests/studio-browser.cjs` comprueba el flujo con una sesión y servidor simulados; requiere Playwright y `STUDIO_ROOT` apuntando al checkout de Studio.

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
