# Planificar por planos

En **Plan de Rodaje** y **Plan General**, el selector **Organizar por → Planos** muestra los planos existentes en Shotlist. Escenas sigue siendo la opción inicial; cambiar de vista no modifica el proyecto.

- Cada tarjeta identifica escena original, número de plano, descripción, inicio, fin y duración de rodaje.
- Los planos se agrupan por su escena o tanda de rodaje. El asa permite reordenarlos dentro de esa tanda, con mouse, pantalla táctil o flechas del teclado.
- Al abrir por primera vez, las duraciones se distribuyen proporcionalmente dentro del tiempo ya reservado para la escena. No se agregan horas ni se modifica la Shotlist original.
- Al editar la duración de un plano, cambia el total de su tanda y se desplazan las actividades siguientes por esa diferencia, conservando los intervalos libres. Si hay una superposición previa o se supera el límite del día, no se aplica la operación.
- Deshacer y rehacer recuperan orden, duraciones y horarios. El detalle permite abrir la tanda en Shotlist; allí se puede agregar planos o cambiar su tanda de rodaje.
- Las asignaciones de actores y las escenas del guion se conservan. Los planos sin asignación a una tanda distinta pertenecen a su escena original. Mover una escena a otra jornada lleva su planificación de planos.
- La impresión respeta la vista seleccionada. Las escenas sin planos siguen visibles para que ninguna desaparezca del día.

El orden y las duraciones personalizados se guardan en `shootDays[].shotPlanning[sceneId]`, con referencias a los IDs existentes. Las horas del Call Diario siguen derivándose de los horarios de las escenas/tandas.

Validación: `node tests/shot-planning.test.cjs` y `node tests/shot-planning.browser.cjs` (Playwright con Edge). La prueba de navegador usa un proyecto sintético, cubre escritorio, 820 px y 390 px, impresión, persistencia, arrastre, permisos y deshacer/rehacer.
