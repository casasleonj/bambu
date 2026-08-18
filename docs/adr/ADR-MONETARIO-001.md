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

- ✅ Modelo `ReceivableEntry` (proyección de auditoría): `saldoResultante` + `totalPagadoResultante` snapshots, `tipo` PAGO|ABONO, `offlineId @unique`.
- ✅ `registrarReceivableEntry(tx, input)` — genera la proyección en la MISMA transacción del Pago/Abono (contrato §12).
- ✅ Integrado en `POST /api/pedidos/pagar-fiado`, `POST /api/abonos` y `CrearPedidoUseCase`.
- ✅ `detectarDivergencia` (proyección vs canónico) + `registrarDivergencia` → log `DUAL_WRITE_DIVERGENCE` + métrica `dual_write_divergence_count` (no autocorrige, no inventa, no altera histórico).
- ✅ Módulo de métricas `src/lib/metrics.ts` (contadores Pino) + endpoint `GET /api/metrics` (ADMIN).
- ✅ Tests: unit (detector puro) + integración (proyección == canónico, divergencia detectable).

## Estado de implementación (FASE FINAL)

- ✅ `ReceivableEntry` ahora se genera en TODOS los `Pago`/`Abono`: `POST /api/pedidos/venta-libre`, `CrearVentasLibresService` (cierre) y `EntregarPedidoUseCase` (pagos al entregar), además de pagar-fiado/abonos/crear-pedido. La NotaCredito (anular/cancelar) no es un Pago/Abono, por lo que no genera proyección (§12 aplica a Pago/Abono).
