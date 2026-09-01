-- Migration: add_abono_offline_id
-- Date: 2026-08-31
-- Purpose: G1 (docs/pedidos/INVENTARIO_PEDIDOS_OPERACION_COMERCIAL.md) — clave
--   idempotente para POST /api/abonos. Antes: doble submit / retry de red =
--   doble abono (dinero cobrado registrado dos veces, sin dedup). Ahora: el
--   retry con el mismo offlineId retorna el abono existente (deduped) sin
--   re-aplicar, dentro del lock CARTERA:{clienteId}.
--
-- Aditiva y reversible. Nullable: los abonos históricos y los creados por
--   /api/pedidos/pagar-fiado (que aplica FIFO sobre varias facturas y ya
--   deduplica por Pago.offlineId) quedan con offlineId NULL. El índice UNIQUE
--   de Postgres considera cada NULL distinto, así que múltiples NULL conviven.
--
-- Idempotente (IF NOT EXISTS). La tabla "Abono" ya existe y hereda los grants
--   app_read/app_write; ADD COLUMN no requiere re-GRANT.

ALTER TABLE "Abono" ADD COLUMN IF NOT EXISTS "offlineId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Abono_offlineId_key" ON "Abono"("offlineId");
