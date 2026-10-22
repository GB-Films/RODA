# GB Production Board

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

## Plan General

Arrastrar el encabezado de un dia sobre otro intercambia su locación, escenas y horarios
relativos al call, duraciones, colores y planos marcados. Las fechas mantienen su
orden cronologico; el call, las notas, el equipo y los bloques propios de cada
fecha permanecen en ese dia. Tambien funciona con dias vacios.

`js/day-swap.js` contiene el intercambio compartido con la integración de GB
Studio. Su controlador permite arrastrar un encabezado a otro día o elegir
origen y destino con Enter o Espacio; Escape cancela la selección. Comprueba
el permiso de edición al iniciar y al soltar, y no cambia la lista de fechas.

## Trabajo simultaneo

Los proyectos de Firebase reciben cambios en vivo, sin recargar la pagina.
Los cambios en campos distintos se combinan, incluso dentro de una misma escena.
Si dos personas cambian el mismo campo, prevalece el ultimo guardado confirmado;
si una elimina una fila mientras otra la edita, se mantiene la eliminacion.

Sin conexion, los cambios quedan guardados en este navegador y se combinan al
reconectar. El indicador muestra `Guardando…`, `En vivo` o el estado de conexion.
La pantalla espera a que termines de editar un campo o cierres un dialogo antes
de volver a dibujarse; la sincronizacion de datos sigue funcionando mientras tanto.
El modo lector recibe actualizaciones sin enviar cambios.

Al instalar esta actualizacion, todas las personas deben recargar sus pestanas
una vez. Las pestanas con el codigo anterior todavia usan el guardado completo.

## Verificacion

Con Node.js, sin instalar dependencias:

```sh
node --test tests/*.test.cjs
```

Las pruebas cubren intercambios, edicion simultanea, conflictos, guardados lentos,
reconexion y escrituras atomicas con reintentos usando un backend simulado.


### Producción compartida en GB Studio

La versión alojada de Roda comparte su guion y sus jornadas con Croki y el PDR por escenas del mismo proyecto de GB Studio. El adaptador `js/studio-live-sync.js` protege las lecturas asíncronas: no aplica respuestas durante una edición ni después de que comenzó una edición nueva. La integración del editor, los permisos por sección y el almacenamiento atómico se mantienen en `GB-Films/GB-Studio` (`roda/js/studio-entry.js`, `studio-storage.js` y `app.js`). El Roda independiente conserva su sincronización propia con `collaboration.js`.

Pruebas del adaptador: `node --test tests/studio-live-sync.test.cjs`.

La integración de GB Studio utiliza `js/script-revisions.js` para conservar las identidades de producción al insertar, renumerar o mover escenas entre versiones. La importación permite crear una versión o reemplazar la seleccionada; las jornadas y los ajustes de las escenas existentes se conservan y las nuevas quedan sin asignar. Las coincidencias ambiguas mantienen las escenas anteriores para revisión manual. `js/google-docs.mjs` lee la revisión actual del documento vinculado sin caché, con progreso, cancelación y tiempos límite; solo solicita seleccionar el archivo cuando falta permiso. La interfaz y el guardado se integran en `GB-Films/GB-Studio`.

Pruebas de revisiones e importación: `node --test tests/script-revisions.test.cjs tests/google-docs.test.mjs`.
