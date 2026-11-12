# Planificar por planos

En **Plan de Rodaje** y **Plan General**, elegí **Organizar por → Planos**. Cada tarjeta muestra la escena original, número de plano, inicio, fin y duración.

- Arrastrá el asa entre dos tarjetas, incluso de escenas distintas. La línea azul indica la posición de inserción.
- En Plan General podés arrastrar entre jornadas, también hacia una jornada vacía. En el detalle de un plano podés elegir **Jornada de destino** y **Ubicación**, y tocar **Mover plano**. Funciona sin tener el otro día en pantalla y desde el celular.
- Los planos conservan sus minutos: se cierra el espacio que deja el plano y se desplazan las actividades siguientes en el destino, incluidos los bloques. Los intervalos libres que ya existían se conservan. No se intercambian los IDs ni se duplican escenas o planos del guion.
- La primera lectura distribuye proporcionalmente los minutos de cada escena entre sus planos. Cambiar de vista no guarda ni modifica el horario. La planificación independiente se guarda al hacer un movimiento o programar un plano pendiente.
- **Programar un plano pendiente** permite agregar planos existentes que todavía no están asignados a una jornada. También se puede crear uno desde Shotlist. Las escenas sin planos conservan su espacio.
- Deshacer y rehacer recuperan los horarios de ambas jornadas. Si la operación supera el final del día o parte de actividades superpuestas, se rechaza completa.
- En una jornada organizada por planos, **Escenas** resume los grupos consecutivos; una misma escena puede aparecer en varios tramos y días. Para editar esos tramos se usa **Planos**. Los planes tradicionales por escenas siguen funcionando igual.
- Shotlist muestra únicamente los planos de la jornada, con sus horas reales. El Call Diario usa las primeras y últimas intervenciones de cada escena en ese día y conserva las exclusiones y citaciones manuales. Las asignaciones de intérpretes no cambian. La impresión del plan y el itinerario del call respetan los tramos reales.

## Persistencia y colaboración

`shootDays[].shotTimeline` almacena referencias por `ownerId|shotId`, con escena/tanda, inicio relativo al call y duración. `sceneIds`, `times` y `durations` resumen las ventanas de trabajo para los consumidores por escena; una escena puede estar en más de una jornada, sin duplicarse en `state.scenes`. Los bloques siguen siendo `day.blocks`. Los planes anteriores con `shotPlanning` se leen sin migración hasta la primera operación.

En conflictos simultáneos sobre el mismo horario, se aplica la transacción local a las jornadas conectadas por el movimiento para evitar planos duplicados o superpuestos. Se conservan las ediciones independientes del guion, equipo, notas y jornadas no conectadas. Deshacer comprueba conflictos antes de restaurar.

Validación: pruebas del modelo, historial, colaboración, citaciones y movimientos de escenas, más navegador con proyecto sintético. Incluyen arrastre entre días, intercalado, jornada vacía, persistencia, deshacer/rehacer, permisos, impresión, escritorio, iPad (820 px) y móvil (390 px). No modifican datos reales de producción.
