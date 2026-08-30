-- ADR-MONETARIO-001 / bug pagar-fiado: `ReceivableEntry.offlineId` era @unique,
-- pero un solo request de `POST /api/pedidos/pagar-fiado` reparte el abono FIFO
-- sobre N pedidos y genera UNA proyección por pedido tocado, todas con el mismo
-- offlineId del batch. Apenas el abono cubría 2+ pedidos, el 2do
-- `receivableEntry.create()` violaba el índice único -> rollback de toda la
-- transacción -> 500 "Error procesando el pago" (genérico, sin detalle).
--
-- Igual que `Pago.offlineId` (que NO es único por el mismo motivo de batch), el
-- offlineId acá pasa a ser sólo índice de búsqueda/auditoría. La idempotencia de
-- replay offline la garantiza el check de `Pago` dentro del lock CARTERA, no
-- esta columna.
--
-- Idempotente: seguro de re-ejecutar (dev via `db push`, prod via `db push` +
-- este SQL).

DROP INDEX IF EXISTS "ReceivableEntry_offlineId_key";

CREATE INDEX IF NOT EXISTS "ReceivableEntry_offlineId_idx" ON "ReceivableEntry"("offlineId");
