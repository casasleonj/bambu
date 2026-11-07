# Fiado por entregas parciales (#656 / #658)

Una entrega parcial genera importe exigible por lo entregado menos lo pagado, acotado al saldo contractual. Cobrar ese importe no cancela el saldo de mercancía pendiente ni marca el pedido como entregado. El excedente conserva la revisión explícita y el saldo a favor existentes.

- Cada evento conserva cantidades por producto, precio histórico, fecha, identidad y huella. El importe vigente se calcula con el precio comercial y el cumplimiento actual. No se actualiza `asignado`: la columna se conserva para compatibilidad durante despliegue/rollback.
- Se registran hechos tanto en entrega directa como en cierre parcial de embarque.
- Un replay antiguo A/B/A se deduplica antes de aplicar cantidades o pagos. Reusar identidad con otro payload produce conflicto.
- Cobros adquieren CARTERA y después PEDIDO por id ascendente; entregas y correcciones usan PEDIDO. No hay transacciones anidadas.
- Dashboard, Fiados, estadísticas de cliente, preparación/reparto de cobro, abonos, reporte de cartera y vencimiento de promesas usan el mismo lector de exigibles.
- Pedidos antiguos sin hechos siguen la transición aprobada: no se inventa exigible de parciales antiguos. Al completar, el saldo íntegro es exigible, aunque solo la última entrega tenga hecho. No hay backfill automático.
- Correcciones de pago/precio/cantidad se reflejan al leer; los hechos no cambian. Estados cancelado/anulado aportan cero. V19 comprueba estructura de los hechos.

## Despliegue y transición

`FIADO_ENTREGA_PARCIAL=false` por defecto. Con OFF, ni el registro ni la lectura de exigibles acceden a la tabla nueva, y se preserva el criterio de deuda entregada.

Procedimiento utilizado para el despliegue inicial (no repetir una activación ya autorizada):

1. Revisar y aplicar SQL aditivo e idempotente de `20261108_entrega_exigible` y `20261109_exigible_hechos`. Ambas migraciones fueron ejecutadas dos veces sobre PostgreSQL desechable.
2. Verificar columnas `eventoId`, `huella`, `lineas`, CHECK de importes, índice único `(pedidoId, eventoId)` y acceso bloqueado desde los roles públicos de Supabase.
3. Integrar el PR con CI resuelto y el flag apagado.

Antes de activar, confirmar el rol real de Prisma. Si el runtime usa `app_write`, autorizar expresamente sus permisos `SELECT, INSERT` sobre esta tabla y sus políticas RLS de lectura e inserción. El rol propietario no necesita permisos adicionales. Verificar con el rol runtime una lectura e inserción dentro de una transacción que termine en ROLLBACK. Activar el flag por decisión explícita posterior y probar el recorrido de Fiados.

Rollback de comportamiento: volver el flag a false. Los hechos ya capturados quedan conservados. OFF oculta los fiados parciales, por lo que no es una solución permanente del incidente original.

## Comprobaciones

Las pruebas nuevas cubren prepago menor/igual/mayor, pago posterior sin completar el pedido, saldo contractual, dos cobros concurrentes, replay A/B/A, payload cambiado, rollback transaccional, rebaja seguida de nueva entrega, FIFO retroactivo, transición histórica, estados terminales, producto duplicado y modo OFF sin tabla. La UI revisa el exigible y el excedente antes de registrar.

Limitación operativa conservada: el cron que genera automáticamente deuda de trabajador sigue limitado a pedidos completos con embarque; no se atribuye por suposición el fiado parcial al último repartidor. No se alteraron fechas ni cifras de ventas/caja.

## Reconciliación de proyecciones (#656 / #631 / #673)

Decisión del PO y presentación mínima aprobada en el tercer listado de incidencias: el valor comercial del pedido se conserva; la deuda por cobrar solo incluye lo entregado. Por ejemplo, seis unidades de $2.000 son un pedido de $12.000; si se entregan cuatro sin pago, se pueden cobrar $8.000 y quedan $4.000 de mercancía pendiente. Cobrar esos $8.000 no completa la entrega. Este ejemplo es sintético.

- Consulta de Pedidos, su filtro «fiado»/«esperando pago», detalle y Cierre usan `leerExigibles`, igual que Fiados y Dashboard. El filtro se aplica antes de contar y paginar; el resumen corresponde al conjunto completo seleccionado.
- La lectura de pedido/factura/pagos/exigible en el detalle usa un mismo snapshot `RepeatableRead`. No se crea una segunda cuenta por cobrar ni se modifica el saldo contractual para presentar estas cifras.
- Cierre comparte con Dashboard el cálculo de valor entregado. Conserva aparte el valor comercial original; las unidades pendientes no se presentan como venta entregada. Los nuevos reportes tienen versión `2.2`, incluida en la validación de integridad V18.
- Reducir el remanente de un pedido de la misma fecha conserva la venta ya entregada y baja solo su valor comercial pendiente. Se mantiene la regla explícita de `ADR-REDUCCION-COMERCIAL-001`: las notas de pedidos anteriores ajustan la fecha de emisión, sin reescribir cierres previos. Ese ajuste comercial no acredita devolución física ni salida de efectivo; se muestra separado del valor entregado.
- Las cifras agrupan los pedidos por su fecha y consultan su **cumplimiento y deuda actuales**. No reconstruyen cómo estaban al terminar un día pasado. Las unidades físicas siguen por fecha de entrega y el dinero por la fecha usada por su registro financiero; este cambio no corrige la atribución de fecha de las comisiones (#673).
- Un parcial antiguo sin evidencia exigible muestra «Por conciliar» y advierte que el subtotal identificado no es definitivo. No se reconstruye automáticamente desde una cantidad acumulada. El modo OFF conserva su transición; no se cambia el flag al desplegar esta corrección.
- Un cierre consolidado conserva sus columnas y reporte originales, incluidos sus conceptos históricos. No se recalcula ni se reetiqueta como si hubiera utilizado la versión nueva.
- Se conservan entrega directa sin embarque, planificación secundaria, enlaces pedido/factura con retorno, pago por antigüedad, versión de deuda e idempotencia de cobros y entregas.
- La prueba en navegador con exigibles activos detectó que el servidor exigía promesa en una entrega parcial fiada, mientras el formulario ocultaba el campo. El PO aprobó mostrar el campo existente respetando tarjetas, colores e iconos actuales. Se usa la capacidad de gestión directa del servidor; el importe previsto solo anticipa la validación, no sustituye el lector de deuda. Se conserva OFF, se descuentan los anticipos/pagos mixtos y un precio ausente impide inventar una cifra.

Evidencia reproducible: `parciales-proyecciones-656.test.ts` (PostgreSQL, flujos reales y snapshots históricos), `operacion-consulta.test.tsx` (móvil/escritorio) y `parciales-proyecciones-656.spec.ts` (navegador con Hub y exigibles activos). Las recuperaciones de datos particulares se auditan de forma separada y no se publican aquí.

El job existente `E2E Hub` ejecuta ese recorrido con el fiado parcial activo para detectar regresiones entre capacidad del servidor, formulario y persistencia. La matriz general conserva su configuración anterior; no se cambian flags de producción desde CI.


## Seguimiento #660: reducción del remanente

Al autorizar que el cliente deje de recibir el remanente, el estado se reconcilia con las cantidades que siguen comprometidas. Si todas las líneas quedaron satisfechas, se marca ENTREGADO y se proyecta el pago desde ese estado (PAGADO si el total ya está cubierto). Si queda pendiente cualquier producto, conserva el estado físico previo. La fecha y las cantidades de la entrega real se conservan; no se crea otro evento físico.

Una reducción no es una devolución. No escribe stock, producción, cargas, movimientos físicos ni cantidades devueltas. Si había 20 cargadas y se entregaron 5, retirar las otras 15 del compromiso deja las 15 en custodia del vehículo hasta que el cierre/retorno registre lo ocurrido. El cierre diario y dashboard conservan 5 entregadas; la caja conserva el pago original. La factura baja al nuevo total y la nota de crédito se trata una sola vez, con la regla temporal ya existente.

Regresión nueva: `reduccion-cumplimiento-stock-660.test.ts`, 8 casos PostgreSQL con comandos reales y factura, impago/pago parcial/completo, múltiples productos, conservación de stock/carga/devoluciones, conteos del cierre y dashboard, nota del día/venta anterior y reintento de autorización. Las pruebas locales corren sobre `bambu660_tests`, separada de la demo que usa el usuario.

La prueba de factura detectó además una proyección rezagada en cobros de entrega parcial: ahora cualquier cobro de entrega y de cierre actualiza `Factura.montoPagado/saldo/estado` desde el pedido canónico. La reducción también toma el pagado canónico al recalcular la factura, en vez de propagar un valor previo rezagado. La fecha de factura se conserva cuando el cierre sigue parcial.
