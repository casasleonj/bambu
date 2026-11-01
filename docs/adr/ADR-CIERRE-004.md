# ADR-CIERRE-004 — Corrección de precio de una línea del pedido con recálculo

- Estado: **Aceptado** (PO 2026-10-26) — implementado en la Fase D del cierre V2
- Fecha: 2026-10-26
- Fuente: épica #447; #326; decisiones del PO del 2026-10-24 (ADR-MONETARIO-002 §1) y del 2026-10-26 (abajo)
- Implementa: ADR-MONETARIO-002 §1. **No** implementa §2 (reducción comercial, #451): sigue pendiente.

## Contexto

Un precio corregido en el cierre se guardaba en el ítem, pero `Pedido.total`, `saldo` y la factura no cambiaban (#326), y la pantalla prometía «el cliente pagará menos/más». Hace falta una operación propia, con responsables y rastro, que recalcule la obligación.

## Decisión

1. **Comando propio** `POST /api/pedidos/[id]/corregir-precio`: corrige el precio de **una línea** (producto) y rige para **toda la cantidad pedida** de esa línea: `delta = (precioNuevo − precioAnterior) × cantPedido`.
2. **Quién:** ADMIN y ASISTENTE la registran. Si la registra un **ADMIN** se aplica en el acto; si la registra un **ASISTENTE** queda `PENDIENTE` hasta que un ADMIN la autoriza o rechaza (`PATCH /api/pedidos/correcciones-precio/[id]`). Motivo obligatorio.
3. **Qué se recalcula**, en una sola transacción bajo el lock `PEDIDO`: `PedidoItem.precio/subtotal` (marcado `manual`, autorizado), la columna legacy de precio, `Pedido.total/saldo/estadoPago` y `Factura.subtotal/total/saldo/estado`. Se conservan las invariantes del verificador (V1: `totalPagado + saldo = total`; V3: factura con el mismo saldo).
4. **Pagó de más → el excedente pasa a saldo a favor** (ADR-SALDO-FAVOR-EXCEDENTE-001, #533; antes se rechazaba con `422 PRECIO_GENERARIA_SOBREPAGO`). Decisión del PO del 2026-10-26: si el nuevo total quedara por debajo de lo ya pagado, el sistema no corrige. Razón técnica: `chk_pedido_montopagado_le_total` y la regla `totalPagado = Σ Pago + Σ Abono` (V2) no permiten bajar el total sin reversar pagos, y un `Pago` no puede ser negativo. Acreditar el excedente a `Cliente.saldoFavor` queda para cuando exista la reversión de pagos (ver `POLITICA_SALDO_FAVOR…`).
5. **Precio raro:** menos de $2.000 en pacas (agua/hielo) o menos de $7.500 en botellón. Se marca y solo un ADMIN lo aplica (siempre, porque solo el ADMIN aplica).
6. **Una solicitud pendiente por línea.** Si el precio de la línea cambió antes de autorizar, la solicitud queda obsoleta (`409 CORRECCION_OBSOLETA`).
7. **Sin `NotaCredito`.** Se recomendó emitir una nota de crédito cuando el precio baja, pero `/api/cierre` calcula `totalVentas = Σ Pedido.total − Σ NotaCredito`: bajar el total y emitir la nota por lo mismo contaría la rebaja dos veces en el cierre del día. La traza queda en la propia solicitud (`PedidoCorreccionPrecio`) y en la auditoría. Para subidas y bajadas la factura se ajusta como ya hace el diferencial de N2.
8. **Idempotencia:** `offlineId` al solicitar; «ya resuelta → deduped» al resolver. No se encola sin red: la corrección necesita validación del servidor.

## Interfaz (flag `NEXT_PUBLIC_CIERRE_V2`, apagado)

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
- Sigue pendiente (#451): la reducción comercial («el cliente ya no quiere el resto»), con nota de crédito cuando corresponda y saldo a favor.
- El caso «pagó de más» lo resuelve ADR-SALDO-FAVOR-EXCEDENTE-001 (#533); la pantalla sigue pendiente de maqueta.
