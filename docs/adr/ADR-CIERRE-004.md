# ADR-CIERRE-004 — Corrección de precio de una línea del pedido con recálculo

- Estado: **Aceptado** (PO 2026-10-26) — implementado en la Fase D del cierre V2
- Fecha: 2026-10-26
- Fuente: épica #447; #326; decisiones del PO del 2026-10-24 (ADR-MONETARIO-002 §1) y del 2026-10-26 (abajo)
- Implementa: ADR-MONETARIO-002 §1. La reducción comercial (§2, #451) se implementó después: ver `ADR-REDUCCION-COMERCIAL-001`.
- Revisado: 2026-11-08 (#711). El punto 4 cambió con ADR-SALDO-FAVOR-EXCEDENTE-001 (#533); el punto 7 queda como estaba y su vigencia depende de la decisión del PO en #713.

## Contexto

Un precio corregido en el cierre se guardaba en el ítem, pero `Pedido.total`, `saldo` y la factura no cambiaban (#326), y la pantalla prometía «el cliente pagará menos/más». Hace falta una operación propia, con responsables y rastro, que recalcule la obligación.

## Decisión

1. **Comando propio** `POST /api/pedidos/[id]/corregir-precio`: corrige el precio de **una línea** (producto) y rige para **toda la cantidad pedida** de esa línea: `delta = (precioNuevo − precioAnterior) × cantPedido`.
2. **Quién:** ~~ADMIN y ASISTENTE la registran~~ **solo el ADMIN** (decisión del PO 2026-11-08, #616): se aplica en el acto, con motivo obligatorio y rastro. El ASISTENTE ya no registra (403) y ve el historial con un aviso. Las solicitudes `PENDIENTE` que dejó antes siguen existiendo y un ADMIN las autoriza o rechaza (`PATCH /api/pedidos/correcciones-precio/[id]`). Antes: el ASISTENTE solicitaba y quedaba `PENDIENTE` hasta que un ADMIN la resolvía.
3. **Qué se recalcula**, en una sola transacción bajo el lock `PEDIDO`: `PedidoItem.precio/subtotal` (marcado `manual`, autorizado), la columna legacy de precio, `Pedido.total/saldo/estadoPago` y `Factura.subtotal/total/saldo/estado`. Se conservan las invariantes del verificador (V1: `totalPagado + saldo = total`; V3: factura con el mismo saldo).
4. **Pagó de más → el excedente pasa a saldo a favor** (ADR-SALDO-FAVOR-EXCEDENTE-001, #533). Si el nuevo total queda por debajo de lo ya pagado, la diferencia se traslada del pedido a `Cliente.saldoFavor`; los `Pago` no se tocan y la caja del día no cambia. Solo se acredita con pagos confirmados y nunca a `CONSUMIDOR_FINAL` (`422 EXCEDENTE_SIN_CLIENTE` / `EXCEDENTE_SIN_CONFIRMAR`). *Historia:* la primera versión de esta fase rechazaba este caso con `422 PRECIO_GENERARIA_SOBREPAGO`, porque `chk_pedido_montopagado_le_total` y la regla `totalPagado = Σ Pago + Σ Abono` (V2) no permiten bajar el total sin reversar pagos y un `Pago` no puede ser negativo; #533 lo reemplazó.
5. **Precio raro:** menos de $2.000 en pacas (agua/hielo) o menos de $7.500 en botellón. Se marca y solo un ADMIN lo aplica (siempre, porque solo el ADMIN aplica).
6. **Una solicitud pendiente por línea.** Si el precio de la línea cambió antes de autorizar, la solicitud queda obsoleta (`409 CORRECCION_OBSOLETA`).
7. **Sin `NotaCredito`.** Se recomendó emitir una nota de crédito cuando el precio baja, pero `/api/cierre` calculaba `totalVentas = Σ Pedido.total − Σ NotaCredito`: bajar el total y emitir la nota por lo mismo contaba la rebaja dos veces en el cierre del día. **Ese motivo técnico ya no aplica:** #519 (`resumirVentasCierre`) evita el doble conteo y la reducción comercial sí emite nota (ADR-REDUCCION-COMERCIAL-001). Hoy la corrección de precio sigue sin emitirla; si debe hacerlo es una decisión del PO pendiente en #713. La traza queda en la propia solicitud (`PedidoCorreccionPrecio`) y en la auditoría. Para subidas y bajadas la factura se ajusta como ya hace el diferencial de N2.
8. **Idempotencia:** `offlineId` al solicitar; «ya resuelta → deduped» al resolver. No se encola sin red: la corrección necesita validación del servidor.

## Interfaz (flag `NEXT_PUBLIC_CIERRE_V2`, activo en producción desde el 2026-11-01 por decisión del PO, ver #447)

- Detalle del pedido: panel «Corrección de precio» con historial, formulario (producto, precio nuevo, motivo, efecto en el total) y, para el ADMIN, Autorizar/Rechazar en las pendientes.
- Pantalla de cierre V2: enlace «¿Precio equivocado? Corregirlo en el pedido» (el cierre no se recalcula a mitad de captura; el precio sigue en solo lectura).

## Implementación

| Pieza | Dónde |
|---|---|
| Reglas puras | `src/modules/pedidos/domain/services/correccion-precio.service.ts` |
| Aplicar | `src/modules/pedidos/application/services/aplicar-correccion-precio.service.ts` |
| Casos de uso | `…/use-cases/CorreccionPrecioUseCases.ts` |
| Tabla `PedidoCorreccionPrecio` (aditiva, idempotente) | `prisma/migrations/20261026_pedido_correccion_precio/` |
| API | `…/api/pedidos/[id]/corregir-precio`, `…/correcciones-precio`, `…/api/pedidos/correcciones-precio/[id]` |
| UI | `src/components/correccion-precio/correccion-precio-panel.tsx` |
| Pruebas | `correccion-precio.test.ts` (Postgres real), `correccion-precio.service.test.ts`, `correccion-precio-http.test.ts`, `correccion-precio-panel.test.tsx`, `e2e/pedidos-correccion-precio.spec.ts` |

## Consecuencias

- La migración es solo aditiva: se aplica en producción **antes** del merge (AGENTS.md, paso 7).
- La reducción comercial («el cliente ya no quiere el resto») está implementada: ADR-REDUCCION-COMERCIAL-001 (#451).
- El caso «pagó de más» lo resuelve ADR-SALDO-FAVOR-EXCEDENTE-001 (#533).
- Pendiente de decisión del PO: si la corrección de precio a la baja debe emitir nota de crédito (#713).
