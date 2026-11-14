# Devolver el saldo a favor al cliente (#560)

**Devolver el saldo a favor al cliente (#560, servidor)**: `POST /api/clientes/[id]/saldo-favor/devolver` (solo ADMIN, salida de dinero). Body `{ monto, metodo (EFECTIVO|TRANSFERENCIA|NEQUI|DAVIPLATA), motivo, offlineId }`.
   - **Contrato**: monto ≤ `Cliente.saldoFavor` (409 `SALDO_INSUFICIENTE`), baja el saldo con condición (nunca negativo, aun con dos devoluciones simultáneas) bajo el lock `CARTERA` del cliente, registra una fila append-only en `DevolucionSaldoFavor` (CHECK monto > 0 y metodo ≠ BONO) y audita `DEVOLUCION_SALDO_FAVOR` (`src/lib/devolver-saldo-favor.ts`). Idempotente por `offlineId`. La venta anónima no tiene saldo (422).
   - **Caja**: `resumirAbonosDelDia` la resta como ajuste de cobros del día de registro; solo el EFECTIVO resta de `cobroCarteraEfectivo` (y por tanto del efectivo esperado). No reabre cierres anteriores. Sale en la lista de correcciones del cierre.
   - **Pendiente**: pantalla (requiere maqueta aprobada), movimiento «Devolución» en la lista de #696, paridad en el Dashboard (`cobros-periodo`) y regla del verificador de integridad.
   - **Migración** `20261111_devolucion_saldo_favor` (aditiva, idempotente; aplicar en producción antes del merge).
   - Pruebas: `integration/devolver-saldo-favor-560.test.ts`.
