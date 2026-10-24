# ADR-MONETARIO-001 — Ledger monetario y ReceivableEntry

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §2, §12
- Fase de implementación: FASE 5

## Contexto

El sistema organiza el dinero en un ledger monetario (`Pago` / `Abono` / `Gasto`). La cartera de un cliente debe tener una única fuente de verdad, y las proyecciones de auditoría no pueden competir con ella.

## Decisión

- `Pedido.saldo` y `Pedido.totalPagado` son la **fuente canónica** del balance por pedido.
- `Pago` / `Abono` / `Gasto` son hechos monetarios canónicos.
- `ReceivableEntry` es una **proyección de auditoría derivada** (`saldoResultante` es un snapshot), nunca una segunda fuente de verdad ni un ledger independiente.

Regla de generación: todo `Pago`/`Abono` actualiza `Pedido.saldo` y, **en la misma transacción**, genera `ReceivableEntry`.

## Invariantes

- No pueden existir dos ledgers monetarios competidores.
- Nunca se calcula `ReceivableEntry.saldoResultante` como si fuera un ledger independiente.

## Detección de divergencia

Si hay divergencia entre una proyección y el canónico:

- NO autocorregir silenciosamente.
- NO inventar movimientos.
- NO alterar el histórico.
- Registrar `DUAL_WRITE_DIVERGENCE`.

Si la divergencia supera el umbral configurable → **detener el rollout de la fase**.

## Verificación

Tests §20 "Fuente de verdad": saldo canónico, ReceivableEntry no competidor, divergencia detectable. Métrica `dual_write_divergence_count`.

## Estado de implementación (FASE 5)

- ✅ Modelo `ReceivableEntry` (proyección de auditoría): `saldoResultante` + `totalPagadoResultante` snapshots, `tipo` PAGO|ABONO, `offlineId` indexado (NO `@unique`: un `pagar-fiado` reparte el abono FIFO sobre N pedidos y genera una proyección por pedido, todas con el mismo `offlineId` del batch — igual que `Pago.offlineId`. La idempotencia de replay la da el check de `Pago` dentro del lock CARTERA).
- ✅ `registrarReceivableEntry(tx, input)` — genera la proyección en la MISMA transacción del Pago/Abono (contrato §12).
- ✅ Integrado en `POST /api/pedidos/pagar-fiado`, `POST /api/abonos` y `CrearPedidoUseCase`.
- ✅ `detectarDivergencia` (proyección vs canónico) + `registrarDivergencia` → log `DUAL_WRITE_DIVERGENCE` + métrica `dual_write_divergence_count` (no autocorrige, no inventa, no altera histórico).
- ✅ Módulo de métricas `src/lib/metrics.ts` (contadores Pino) + endpoint `GET /api/metrics` (ADMIN).
- ✅ Tests: unit (detector puro) + integración (proyección == canónico, divergencia detectable).

## Estado de implementación (FASE FINAL)

- ✅ `ReceivableEntry` ahora se genera en TODOS los `Pago`/`Abono`: `POST /api/pedidos/venta-libre`, `CrearVentasLibresService` (cierre) y `EntregarPedidoUseCase` (pagos al entregar), además de pagar-fiado/abonos/crear-pedido. La NotaCredito (anular/cancelar) no es un Pago/Abono, por lo que no genera proyección (§12 aplica a Pago/Abono).

## Addendum 2026-10-23 — Corrección de precio en el cierre del embarque (#326)

- Estado: **Aceptado por el PO el 2026-10-23** (el precio SÍ se puede corregir en el cierre, con recálculo de la obligación; no queda congelado). Implementado en el mismo cambio.
- Alcance: `POST /api/embarques/[id]/cerrar` y `/cerrar/preview`, ramas **COMPLETO** y **PARCIAL** (`ProcesarPedidoService`, regla pura en `correccion-precio.service.ts`).

### Regla

1. **Quién y cómo.** Solo `ADMIN`. Cualquier otro rol: `preciosReales` se ignora (como hasta ahora). La corrección exige **motivo** (≥ 5 caracteres, `motivoPrecio`); sin él, `422 PRECIO_SIN_MOTIVO` y el cierre no cambia nada.
2. **Qué es una corrección.** Un precio finito, **mayor que 0** y distinto del precio del pedido, en una línea que se pidió (cantidad pedida > 0). Un precio vacío, `0`, negativo o inválido **no es una corrección**: se conserva el precio del pedido. (La pantalla mandaba `0` por un campo vacío y el servidor lo guardaba como precio del pedido.)
3. **Alcance en PARCIAL.** El precio corregido rige para **todo el pedido**, no solo para lo entregado en este cierre: cada línea (`PedidoItem`) tiene un único precio y `Pedido.total` sigue siendo la suma de sus líneas. Lo ya entregado y lo que queda pendiente se valoran al mismo precio. *Esta es la decisión que quedó abierta en el issue (punto 5); se tomó por coherencia con el modelo y con G11 — revisable por el PO.*
4. **Qué se recalcula** (misma transacción del cierre, con los locks `CIERRE`/`PEDIDO` ya existentes):
   - `PedidoItem.precio` y `PedidoItem.subtotal` (cantidad **pedida** × precio) de las líneas afectadas, y las columnas legacy `Pedido.precio*`;
   - `Pedido.total = total + Σ (precio nuevo − precio anterior) × cantidad pedida` (se suma el delta para respetar ajustes ya aplicados al total, p. ej. diferenciales N2; no se recalcula Σ líneas);
   - `Pedido.saldo = total − totalPagado`, y `estadoPago` proyectado con el total nuevo (`chk_pedido_estadopago_proyectado`);
   - `Factura.total`, `saldo` y `estado` (en PARCIAL sin completar, sin tocar la fecha).
   El cobro nuevo de la misión se valida contra el **total nuevo** (`PAGOS_EXCEDIDOS`).
5. **Sobrepago.** Si el nuevo total queda **por debajo de lo ya pagado**, se rechaza con `422 PRECIO_GENERARIA_SOBREPAGO` y no cambia nada: igual que `CORRECCION_GENERARIA_SOBREPAGO` de G11, exige primero una reversión monetaria (ADR-CORRECCION-MONETARIA-001). Nunca es un 500, y no se inventa un crédito a `saldoFavor`: `totalPagado` debe seguir igualando Σ `Pago` + Σ `Abono` (verificador V2) y la política de saldo a favor exige causa y autorización. Acreditar el excedente automáticamente queda como mejora futura.
6. **Comisión y valor entregado.** `totalVentas`/comisión usan el precio **vigente** (el corregido) en ambas ramas; antes COMPLETO usaba el corregido y PARCIAL el original.
7. **Auditoría.** `Historial.PRECIO_CIERRE` registra antes/después por producto, **motivo**, `totalAntes`, `totalDespues`, `saldoDespues` y `alcance: PEDIDO_COMPLETO`.
8. **Preview = cierre.** `pedidosActualizados[].correccionPrecio` (`totalAntes`, `totalDespues`, `saldoAntes`, `saldoDespues`, `motivo`, `cambios`) viaja en el preview (dry-run) y en el cierre; la pantalla del cierre muestra el nuevo total y saldo **antes** de confirmar y pide el motivo.

### Invariantes que se conservan

- V1 `totalPagado + saldo = total`, V2 `totalPagado = Σ Pago + Σ Abono`, V3 factura con el mismo saldo que el pedido: la corrección no toca los pagos.
- La obligación NO se recalcula desde lo entregado (PR-1): solo una corrección de precio autorizada mueve `total`.

### Pruebas

`src/lib/__tests__/integration/cierre-correccion-precio.test.ts` (Postgres real), `src/modules/embarques/domain/services/__tests__/correccion-precio.service.test.ts` y `pedido-cuadre-correccion-precio.test.tsx`.
