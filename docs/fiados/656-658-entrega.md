# Fiado por entregas parciales (#656 / #658)

Una entrega parcial genera importe exigible por lo entregado menos lo pagado, acotado al saldo contractual. Cobrar ese importe no cancela el saldo de mercancía pendiente ni marca el pedido como entregado. El excedente conserva la revisión explícita y el saldo a favor existentes.

- Cada evento conserva cantidades por producto, precio histórico, fecha, identidad y huella. El importe vigente se calcula con el precio comercial y el cumplimiento actual. No se actualiza `asignado`: la columna se conserva para compatibilidad durante despliegue/rollback.
- Se registran hechos tanto en entrega directa como en cierre parcial de embarque.
- Un replay antiguo A/B/A se deduplica antes de aplicar cantidades o pagos. Reusar identidad con otro payload produce conflicto.
- Cobros adquieren CARTERA y después PEDIDO por id ascendente; entregas y correcciones usan PEDIDO. No hay transacciones anidadas.
- Dashboard, Fiados, estadísticas de cliente, preparación/reparto de cobro, abonos, reporte de cartera y vencimiento de promesas usan el mismo lector de exigibles.
- Pedidos antiguos sin hechos siguen la transición aprobada: no se inventa exigible de parciales antiguos. Al completar, el saldo íntegro es exigible, aunque solo la última entrega tenga hecho. No hay backfill automático.
- Correcciones de pago/precio/cantidad se reflejan al leer; los hechos no cambian. Estados cancelado/anulado aportan cero. V19 comprueba estructura de los hechos.

## Activación pendiente de autorización de producción

`FIADO_ENTREGA_PARCIAL=false` por defecto. Con OFF, ni el registro ni la lectura de exigibles acceden a la tabla nueva, y se preserva el criterio de deuda entregada.

Antes de activar:

1. Revisar y aplicar SQL aditivo e idempotente de `20261108_entrega_exigible` y `20261109_exigible_hechos`. Ambas migraciones fueron ejecutadas dos veces sobre PostgreSQL desechable.
2. Verificar columnas `eventoId`, `huella`, `lineas`, CHECK de importes e índice único `(pedidoId, eventoId)`.
3. Autorizar expresamente y aplicar permisos al rol runtime: `GRANT SELECT, INSERT, UPDATE ON TABLE "EntregaExigible" TO app_write;` UPDATE conserva compatibilidad con la versión anterior. No necesita GRANT sobre otras tablas ni permisos administrativos.
4. Comprobar con el rol runtime lectura e inserción dentro de una transacción que termine en ROLLBACK.
5. Integrar el PR con CI resuelto. Activar el flag por decisión explícita posterior y probar el recorrido de Fiados. No cerrar #656 hasta verificar el comportamiento activado.

Rollback de comportamiento: volver el flag a false. Los hechos ya capturados quedan conservados. OFF oculta los fiados parciales, por lo que no es una solución permanente del incidente original.

## Comprobaciones

Las pruebas nuevas cubren prepago menor/igual/mayor, pago posterior sin completar el pedido, saldo contractual, dos cobros concurrentes, replay A/B/A, payload cambiado, rollback transaccional, rebaja seguida de nueva entrega, FIFO retroactivo, transición histórica, estados terminales, producto duplicado y modo OFF sin tabla. La UI revisa el exigible y el excedente antes de registrar.

Limitación operativa conservada: el cron que genera automáticamente deuda de trabajador sigue limitado a pedidos completos con embarque; no se atribuye por suposición el fiado parcial al último repartidor. No se alteraron fechas ni cifras de ventas/caja.


## Seguimiento #660: reducción del remanente

Al autorizar que el cliente deje de recibir el remanente, el estado se reconcilia con las cantidades que siguen comprometidas. Si todas las líneas quedaron satisfechas, se marca ENTREGADO y se proyecta el pago desde ese estado (PAGADO si el total ya está cubierto). Si queda pendiente cualquier producto, conserva el estado físico previo. La fecha y las cantidades de la entrega real se conservan; no se crea otro evento físico.

Una reducción no es una devolución. No escribe stock, producción, cargas, movimientos físicos ni cantidades devueltas. Si había 20 cargadas y se entregaron 5, retirar las otras 15 del compromiso deja las 15 en custodia del vehículo hasta que el cierre/retorno registre lo ocurrido. El cierre diario y dashboard conservan 5 entregadas; la caja conserva el pago original. La factura baja al nuevo total y la nota de crédito se trata una sola vez, con la regla temporal ya existente.

Regresión nueva: `reduccion-cumplimiento-stock-660.test.ts`, 8 casos PostgreSQL con comandos reales y factura, impago/pago parcial/completo, múltiples productos, conservación de stock/carga/devoluciones, conteos del cierre y dashboard, nota del día/venta anterior y reintento de autorización. Las pruebas locales corren sobre `bambu660_tests`, separada de la demo que usa el usuario.

La prueba de factura detectó además una proyección rezagada en cobros de entrega parcial: ahora cualquier cobro de entrega y de cierre actualiza `Factura.montoPagado/saldo/estado` desde el pedido canónico. La reducción también toma el pagado canónico al recalcular la factura, en vez de propagar un valor previo rezagado. La fecha de factura se conserva cuando el cierre sigue parcial.
