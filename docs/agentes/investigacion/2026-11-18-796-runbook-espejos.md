# #796 paso 3 · Dejar de crear el abono espejo del cobro del día — runbook de activación

Estado: **IMPLEMENTADO detrás de `COBRO_DIA_SIN_ESPEJO` (apagada por defecto).** Fusionar el código no cambia nada en producción. Activarla es decisión del PO.

## Qué cambia cuando se activa
`POST /api/pedidos/pagar-fiado` **no crea el `Abono` espejo** (`ESPEJO_PAGO`) cuando se cumplen **todas**:
1. `COBRO_DIA_SIN_ESPEJO=true` **y** `CORRECCION_PAGO_SIN_ABONO=true` (sin el camino de corrección por pago, ese pago no se podría revertir; con la segunda apagada, la primera no tiene efecto).
2. El cobro es de **un solo pedido** (`pedidoId`): el camino de «Registrar pago» de la lista de Pedidos, que el servidor ya valida (#597): entregado **hoy** (día de Bogotá), con saldo, de un cliente real, no vendido fiado a propósito, sin deuda anterior que el reparto pagaría antes y sin pasar su saldo.
3. Si lo registró la oficina («¿quién recibió el dinero?»), la recepción es de **hoy** (`ocurridoAt` nulo): su día de caja es el de la entrega, que este camino ya exigió. Una recepción con **fecha retroactiva** conserva su espejo, porque su día de caja puede no ser el de la entrega.

> **Corrección del 21-nov-2026.** La primera versión excluía **toda** la oficina. Con la bandera activa desde el 18-nov, los 5 cobros del mismo día de un solo pedido que seguían creando espejo entraron todos por la oficina (la «gestión directa»), que es el camino habitual. Se acotó la exclusión a la fecha retroactiva (#796).

**No cambia:** el cobro por Fiados (sin `pedidoId`), los pedidos de días anteriores, los abonos independientes, los 97 espejos históricos (no se borran ni se reclasifican), el `Pago`, el saldo del pedido, la factura, el libro (`ReceivableEntry`) ni la respuesta de la API salvo `abonoCreado: false`.

## Consumidores revisados (XMOD)
| Consumidor | Efecto | Evidencia |
|---|---|---|
| Cierre (`cobro-cartera`, `cobros-periodo`, clasificador) | Sin cambio: cuentan `Pago`; el espejo ya se excluía | `cobro-clasificacion-796`, `cobro-mixto-796` |
| Cartera (`/api/cartera/abonos`) | Sin cambio visible: ya no listaba el cobro del día | `cobro-dia-sin-espejo-796` |
| Factura (pantalla e impresión) | Sin cambio: el historial sale de `Pago` | `factura-historial-796` |
| Integridad (V2, V17, ABONOS_SIN_ESPEJO) | Sin hallazgos nuevos: tratan el `Pago` como fuente | prueba de integridad del paso 3 |
| Corrección | El pago sin espejo se corrige por `POST /api/pagos/[id]/corregir` | prueba y QA en navegador |
| **Estadísticas del cliente** (`/api/clientes/[id]/stats`, `metodosPago`) | **Cambia, para bien:** suma `Pago` **y** `Abono`, así que un pago con espejo se contaba dos veces; sin espejo se cuenta una. Es un defecto previo aparte; no se corrige aquí | lectura del código |

## Conciliación (solo lectura) — antes y después de activar
Ejecutar **antes** de activar y de nuevo **24 h después**. Todo con autorización del PO y sin escribir.
1. **Cobrado del día por medio** (debe ser igual con y sin espejo, porque el Cierre cuenta `Pago`):
   `SELECT metodo, SUM(monto) FROM "Pago" WHERE "createdAt" >= <inicio del día Bogotá> AND "createdAt" < <fin> GROUP BY metodo;` y compararlo con el Cierre de ese día.
2. **Pagos con factura sin espejo desde la activación** (esperado: solo cobros del mismo día por «Registrar pago»):
   `SELECT count(*) FROM "Pago" g JOIN "Factura" f ON f."pedidoId" = g."pedidoId" LEFT JOIN "Abono" a ON a."pagoOrigenId" = g.id WHERE g."createdAt" >= <momento de activación> AND a.id IS NULL;`
3. **Cartera:** total de `GET /api/cartera/abonos` el mismo día antes y después (no debe cambiar).
4. **Integridad:** `GET /api/integridad` antes y después; no debe aparecer ningún hallazgo nuevo sobre esos pedidos.
5. **Corrección:** corregir **un** cobro del día sin espejo con un usuario ADMIN o CONTADOR (decisión del PO, con un monto real mínimo o con un pedido de prueba acordado) y verificar pedido, factura, Cierre y `ReceivableEntry`.

## Orden de activación
1. Confirmar `CORRECCION_PAGO_SIN_ABONO=true` en producción (ya activada el 18-nov-2026; la interfaz ofrece «Corregir» en pagos sin abono).
2. Conciliación «antes».
3. Crear `COBRO_DIA_SIN_ESPEJO=true` (producción) y redesplegar el mismo commit de `main`.
4. Observar el primer cobro del día real y repetir la conciliación.

## Reversa
Poner `COBRO_DIA_SIN_ESPEJO=false` (o borrarla) y redesplegar el mismo commit: `pagar-fiado` vuelve a crear espejos. Los pagos registrados sin espejo durante la ventana **no se tocan**: siguen siendo legibles por el Cierre, la factura y la integridad, y corregibles por su ruta propia. `git revert` no cambia datos.

## Pendiente (fuera de este paso)
- Los 97 espejos históricos y los 22 candidatos del mismo día: sin reclasificar (decisión del PO).
- «Foto del fiado al corte» (fase 2 del issue): migración nueva, autorización aparte.
- El conteo doble de métodos en las estadísticas del cliente: issue aparte.
