# Gate de aprobación — FASE FINAL (contrato técnico §21)

Estado: **PASS** — verificado contra el código implementado (FASES 0–8) + suite completa verde.

Regla §21: "Si algún punto es NO, el programa no ha convergido y no debe pasar a implementación de la fase correspondiente."

## Gate 1 — Fuente de verdad

- [x] Cada dato crítico tiene un único canónico. → `Pedido.saldo`/`totalPagado` (schema `Pedido`, CHECK `chk_pedido_saldo_calc`); ADR-MONETARIO-001.
- [x] Las proyecciones están identificadas. → `ReceivableEntry` (proyección de auditoría, `src/lib/receivable-entry.ts`).
- [x] Los legacy mirrors están identificados. → `EmbarqueProducto`, `Trabajador.capacidadKg` (ADR-MIGRACION-001).
- [x] No existen dos ledgers monetarios competidores. → `ReceivableEntry` es write-only derivado; la cartera se lee de `Pedido.saldo`/`Factura.saldo`.

## Gate 2 — Concurrencia

- [x] `RecoveryDecision` protegido por lock. → `CrearRecoveryDecisionUseCase` (`RECOVERY_SOURCE:{sourceEventId}`).
- [x] `ObligacionPendiente` protegido por lock. → `AsignarActividadUseCase` (`OBLIGACION:{obligacionId}`) + `chk_obligacion_no_sobreconsumo`.
- [x] `PedidoCantidadAjuste` protegido por lock. → modelo con `autorizadoPorId` obligatorio; lock `PEDIDO:{pedidoId}` (ADR-CONCURRENCIA-001).
- [x] Cartera protegida por `clienteId`. → `pagar-fiado`/`abonos` (`CARTERA:{clienteId}`).
- [x] `Actividad` protegida. → partial unique index `Actividad_obligacion_embarque_activa_unique`.
- [x] Carga activa protegida. → `EMBARQUE_CARGA:{embarqueId}` (PUT/DELETE/cancelar) y `{trabajadorId:día}` (crear).
- [x] El helper de locks no genera transacciones anidadas. → `withAdvisoryLock` guard anti-anidación + test `integration/locks.test.ts`.

## Gate 3 — Histórico

- [x] No se inventan vehículos/clientes/precios/cobros/autorizaciones/rutas. → `EmbarqueCarga.vehiculo` null por defecto; `Retorno`/`ResponsibilityCase` con FK nullable; ADR-MIGRACION-001 (§15).

## Gate 4 — Antifraude

- [x] `VentaLibre` distingue ocurrencia/captura/recepción. → `Pedido.occurredAt/capturedAt/serverReceivedAt` + `clasificacionTemporal`.
- [x] Retry no duplica. → claves `@unique` por comando (FASE 1) + dedup por estado.
- [x] Ventas tardías detectables. → `clasificarVentaLibre` (TARDIA/SOSPECHOSA) sin bloquear.
- [x] Regalos auditables. → `PromotionRule.autorizadoPorId` + `validarPromocion`.
- [x] Responsabilidad investigable sin embarque activo. → `ResponsibilityCase.embarqueId` nullable.
- [x] Cargo económico requiere autorización explícita. → `ResolverResponsibilityCaseUseCase` (RESUELTA_CON_CARGO exige `autorizadoPorId` + `resueltoPorId`).

## Gate 5 — Físico

- [x] Semántica tipo→efecto documentada. → enum `TipoMovimiento` + ADR-FISICO-001.
- [x] `cantidad` siempre positiva. → CHECK `chk_embarque_movimiento_cantidad_pos`.
- [x] Entrada/salida inequívoca. → efecto por `tipo`, no por signo.
- [x] Custodia inequívoca. → `origen`/`destino` en `EmbarqueMovimiento`.
- [x] Recovery no duplica unidades. → suma de decisiones previas bajo `RECOVERY_SOURCE`.
- [x] Retorno no crea inventario disponible automáticamente. → `RETORNO` (repartidor→inspección).
- [x] Sustitución no mezcla dos hechos físicos. → `construirMovimientosSustitucion` (2 movimientos) + `Sustitucion`.
- [x] Ajuste autorizado exige `metadata.effect`. → CHECK `chk_embarque_movimiento_ajuste_autorizado` + `validarMovimientoFisico`.

## Gate 6 — Contrato técnico

- [x] `RecoveryDecision.sourceEventId` nullable para FALTANTE. → schema + `validarRecoveryDecision`.
- [x] `cantidadDisponibleEnOrigen` nullable. → schema.
- [x] `cantidadAplicada` significado inequívoco. → CHECK `0 ≤ aplicada ≤ cantidad`.
- [x] `cantidadOriginal/cumplida/asignada` inequívocos. → `ObligacionPendiente`.
- [x] `cantidadDisponible` derivada. → `calcularDisponible` (no se almacena).
- [x] `ResponsibilityCase.autorizadoPorId` obligatorio para cargo. → use case de resolución.
- [x] `VentaLibre` tres timestamps. → `Pedido` + endpoint.
- [x] `availabilityBasis` no representa stock físico. → metadata en `EmbarqueCarga`; el hecho es `EmbarqueCargaProducto.cantidad`.
- [x] `withAdvisoryLock` contrato transaccional explícito. → `src/lib/locks.ts` + ADR-CONCURRENCIA-001.
- [x] Lock de cartera por `clienteId`. → `CARTERA:{clienteId}`.

## Métricas §24 (7/7)

- [x] `dual_write_divergence_count` — FASE 5.
- [x] `recovery_decision_double_consumption_rejected_count` — FASE FINAL.
- [x] `obligacion_double_fulfillment_rejected_count` — FASE FINAL.
- [x] `pedido_ajuste_concurrency_conflict_count` — contador disponible (el flujo de ajuste se implementa en fase futura con ADR propio).
- [x] `venta_libre_tardia_count` — FASE 7.
- [x] `venta_libre_sospechosa_count` — FASE 7.
- [x] `responsibility_case_without_embarque_count` — FASE FINAL.

## Verificación final (§22)

- `npx tsc --noEmit` → 0 errores.
- `npm run test` → suite unit verde.
- `npm run test:integration` → suite de integración (DB real) verde.
- `npx prisma validate` → válido.
