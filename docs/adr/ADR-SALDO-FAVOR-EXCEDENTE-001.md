# ADR-SALDO-FAVOR-EXCEDENTE-001 — Excedente de una corrección de precio o reducción → saldo a favor

- Estado: **Aceptado** (PO 2026-11-01) — implementado en servidor; la pantalla sigue pendiente de maqueta
- Fecha: 2026-11-01
- Fuente: #533; ADR-MONETARIO-002 (decisión del PO del 2026-10-24: «pagó de más → saldo a favor»); `POLITICA_SALDO_FAVOR_Y_DIFERENCIAL_NEGATIVO_v1.0`; ADR-CORRECCION-MONETARIA-001
- Cambia: ADR-CIERRE-004 §4 y ADR-REDUCCION-COMERCIAL-001 §5, que rechazaban el sobrepago

## Contexto

Si una corrección de precio o una reducción comercial deja el nuevo total por debajo de lo ya pagado, antes se rechazaba (`PRECIO_GENERARIA_SOBREPAGO`, `REDUCCION_GENERARIA_SOBREPAGO`): `chk_pedido_montopagado_le_total` impide `totalPagado > total` y un `Pago` no puede ser negativo.

## Cómo lo resuelven otros sistemas

El pago no se borra: sigue siendo un hecho. El excedente se reclasifica como crédito del cliente, sin mover dinero, y después se aplica a una factura futura o se reembolsa como paso aparte. Stripe ofrece, sobre una factura pagada, reembolsar, acreditar al saldo del cliente o registrar un ajuste fuera del sistema; ERPNext deja el excedente como monto sin asignar; y la nota de crédito sobre una factura pagada baja los ingresos y sube el crédito del cliente sin tocar caja. Este repo ya aplica el mismo principio en `CorreccionAbono` + `ReceivableEntry REVERSION` y en la política de saldo a favor («no borrar historia, compensar con operaciones trazables»).

## Decisión

1. **Traslado.** El excedente (`totalPagado − totalNuevo`) pasa del pedido a `Cliente.saldoFavor`. El pedido queda pagado por su nuevo total (`totalPagado = totalNuevo`, saldo 0) y la factura `PAGADA`. Los `Pago` no se tocan y **la caja del día no cambia**: el dinero ya entró y sigue en la empresa, ahora como crédito.
2. **Trazabilidad.** Tabla de solo inserción `PedidoSaldoFavorMovimiento` (`ACREDITACION` / `REAPLICACION`, monto > 0, origen, motivo, autor) más una `ReceivableEntry REVERSION` por el excedente. El neto por pedido es `Σ ACREDITACION − Σ REAPLICACION`.
3. **Una sola transacción**, bajo el lock `PEDIDO` del caller. El saldo del cliente solo se mueve con operaciones atómicas en la base (incremento; decremento condicionado a que alcance), así que no hace falta el lock `CARTERA` y no puede quedar negativo si el cliente lo gasta al mismo tiempo en otro pedido.
4. **Solo si hay a quién acreditar y con qué respaldo.**
   - La venta anónima (`CONSUMIDOR_FINAL`) no tiene a quién acreditar: `422 EXCEDENTE_SIN_CLIENTE`; el excedente se devuelve en efectivo.
   - El crédito se respalda con pagos **confirmados**: `excedente ≤ totalPagado − Σ Pago no confirmados (REPORTADO o DISCREPANTE)`. Acreditar con un pago que nadie confirmó permitiría gastar dinero que quizá nunca llegó: `422 EXCEDENTE_SIN_CONFIRMAR`.
   - Se valida al solicitar (no se encola lo que no se podrá aplicar) y otra vez al aplicar, con los datos de ese momento.
5. **Ida y vuelta.** Si después una corrección **sube** el total y el pedido queda debiendo, se **reaplica** el crédito que salió de ese mismo pedido, hasta lo que falta, hasta lo que quede sin reaplicar de ese pedido y hasta lo que el cliente tenga disponible ahora. Nunca se toca el saldo a favor que el cliente tiene por otros motivos. Si el cliente ya gastó parte, el resto del faltante queda como saldo real del pedido (no se inventa deuda ni se reconstruye el estado anterior).
6. **Anular o cancelar un pedido que trasladó crédito: el crédito se resta (#577, revisa la decisión original de #533).** Anular significa anular: aunque se hubiera pagado de más, un pedido que ya no existe no deja saldo a favor. Al anular o cancelar (y a cada hijo en cascada) se resta del cliente el crédito pendiente de ese pedido (`Σ ACREDITACION − Σ REAPLICACION − Σ REVERSION_ANULACION`), con el mismo decremento atómico condicionado de la reaplicación, y queda un movimiento `REVERSION_ANULACION` con autor y motivo.
   - **Solo lo disponible.** Si el cliente ya gastó una parte en otros pedidos, se resta únicamente lo que le queda y lo demás se informa como `saldoFavorYaUsado`. No se reclama porque esos pedidos quedaron pagados de verdad; el saldo nunca queda negativo y la anulación nunca falla por eso. Lo que queda pendiente en el pedido anulado es exactamente lo ya usado.
   - **Solo lo de este pedido.** El crédito que el cliente tenga por otras vías no se toca.
   - **La nota de crédito no cambia** (sigue siendo `totalPagado`). Subirla por el excedente restaría dos veces las mismas ventas en el cierre diario (`/api/cierre` ya resta la nota de la reducción): restar el crédito no es una venta que se deshace, es un pasivo con el cliente que se extingue, y por eso va en su propio movimiento.
   - **Caja.** Los `Pago` no se tocan y el cierre no cambia, igual que con la devolución de la parte cubierta por la nota. El efectivo que se entregue físicamente al cliente es la operación aparte de «Fuera de alcance».
   - La respuesta informa `saldoFavorRevertido`, `saldoFavorYaUsado` y `saldoFavorCliente` (saldo final); la auditoría registra los dos primeros. `GET /api/pedidos/[id]/saldo-favor` (solo lectura) da la proyección que muestra el diálogo antes de confirmar y el historial del pedido.
   - Requiere indicar quién anula (`actorId`) cuando hay crédito que restar: `ACTOR_REQUERIDO` y no cambia nada.
7. **Verificador (V2).** `totalPagado = Σ Pago + Σ Abono − (Σ ACREDITACION − Σ REAPLICACION) − Σ correcciones de abono` (solo pedidos activos; `REVERSION_ANULACION` ocurre únicamente en pedidos anulados o cancelados, que V2 no revisa, y se ignora a propósito). Sin descontar lo trasladado, cada traslado legítimo sería un falso positivo. Al revisar V2 apareció un falso positivo que ya existía: tras corregir un abono (`CorreccionAbono`) el pedido figuraba como discrepancia aunque todo estaba bien; también se descuenta ahora. Un `totalPagado` que no corresponde a ningún pago sigue detectándose.

## Sumas que no cambian (y por qué)

- **Caja del día** (`cobroVentasHoy`, `cobroCartera`, reportes de ventas por método): suman `Pago` y `Abono` por fecha de captura; no se tocan.
- **«Cobrado» de los pedidos del día** en el cierre (`Σ Pedido.totalPagado`): baja por el traslado, pero es una cifra informativa de lo cobrado *por esas ventas*, distinta de la caja; no se compara con ella.
- **Ventas del día** (`Σ Pedido.total − Σ NotaCredito de días anteriores`): el excedente no genera una nota nueva; la nota de la reducción sigue siendo por lo reducido.

## Fuera de alcance

- **Devolver el saldo a favor al cliente en efectivo** (un egreso de caja con su autorización): #560.
- **Pantalla:** el panel actual todavía impide pasar del tope sin excedente; permitir y explicar el traslado (confirmación con «se acreditarán $X a Tienda…») requiere maqueta aprobada (#559).
- Una carrera ya existente al gastar el saldo a favor al crear un pedido (`aplicarSaldoFavor` lee y luego descuenta, sin CHECK `saldoFavor >= 0`): #561. Lo nuevo no depende de ella.
- La regla de «último autorizador» y demás políticas de saldo a favor no cambian.

## Implementación

| Pieza | Dónde |
|---|---|
| Reglas puras (excedente en centavos) | `correccion-precio.service.ts`, `reduccion-comercial.service.ts` |
| Traslado, reaplicación, respaldo | `src/modules/pedidos/application/services/saldo-favor-excedente.service.ts` |
| Integración | `aplicar-correccion-precio.service.ts`, `aplicar-reduccion-comercial.service.ts`, `AnularPedidoUseCase`, `CancelarPedidoUseCase` |
| Tabla `PedidoSaldoFavorMovimiento` (aditiva, idempotente) | `prisma/migrations/20261101_pedido_saldo_favor_movimiento/` |
| Verificador | `src/lib/integridad/reglas.ts` (V2) |
| Pruebas | `saldo-favor-excedente.test.ts` (26, Postgres real, incluye propiedad aleatoria), `integridad-v2-correccion-abono.test.ts`, dominio de ambas reglas |

## Consecuencias

- La migración es solo aditiva: se aplica en producción **antes** del merge (AGENTS.md, paso 7).
- Un cliente que ya gastó el crédito y luego se anula el pedido no genera deuda: ese crédito ya pagó otros pedidos; se informa como «ya usado» y no se reclama.
- La migración de #577 solo agrega un valor al enum de movimientos (`REVERSION_ANULACION`): se aplica en producción antes del merge.
