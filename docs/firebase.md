# Firebase setup

## Datos que necesito

Pasame estos valores de Firebase Console > Project settings > Your apps > Web app:

- `apiKey`
- `authDomain`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`

Con eso se completa `js/firebase-config.js`.

## Firestore

La app usa esta estructura:

```text
production_projects/{projectId}
production_projects/{projectId}/data/core
production_projects/{projectId}/data/script
```

El documento `core` guarda plan, crew, dias y configuracion general. El documento `script` guarda escenas y guion procesado para evitar un unico documento demasiado grande.

## Sincronizacion colaborativa

Cada guardado lee ambos documentos dentro de una transaccion y combina los
cambios locales respecto de la ultima copia confirmada con el estado del servidor.
La transaccion escribe `core` y `script` juntos con la misma `revision` incremental.
Si otro editor guarda al mismo tiempo, Firestore reintenta contra los datos nuevos.
Las lecturas iniciales tambien usan una transaccion para obtener una copia coherente.

Una suscripcion a la coleccion `data` recibe ambos documentos en una misma
actualizacion. Se ignoran las notificaciones pendientes de confirmacion y las
copias de cache. No se comparan los relojes de las computadoras para resolver
conflictos. La copia confirmada se conserva por proyecto en `localStorage`, junto
con los cambios pendientes, para poder combinarlos despues de reconectar o reabrir.

Los documentos existentes sin `revision` se leen como revision cero; no hace
falta migrarlos ni cambiar `firebase.rules`. Una cache del sistema anterior sin
copia confirmada no se sube automaticamente: se conserva como respaldo local y
se carga el servidor. Todas las pestanas deben recargarse una vez al actualizar.

Referencias: [transacciones de Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions)
y [suscripciones en tiempo real](https://firebase.google.com/docs/firestore/query-data/listen).

## Reglas

El archivo `firebase.rules` deja leer/escribir solo a usuarios autenticados. Para usarlo sin pantalla de login, activa Firebase Authentication > Anonymous.

Para una instalacion privada real conviene cambiar a email/password con lista de usuarios autorizados. El password de edicion de la app solo bloquea botones en el cliente; no es seguridad de backend.

## Modo local

Si `js/firebase-config.js` no tiene config, la app funciona igual en local. Los proyectos creados en ese modo quedan en `localStorage` y se muestran como `(local)`.
