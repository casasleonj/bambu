-- Migration: add_pedido_origen_id
-- Date: 2026-09-06
-- Purpose: G11 (decisión PO 2026-09-06, "B. Nueva demanda") — `Pedido.
--   pedidoOrigenId` (auto-referencia) da trazabilidad cuando un cliente pide
--   unidades adicionales sobre un Pedido existente: se crea un Pedido nuevo
--   e independiente (ciclo de vida propio, sin heredar cantidad/pago), con
--   esta referencia apuntando al Pedido que originó la nueva demanda.
--   NO es un mecanismo de "pedido-hijo" (ese ya no se usa desde PR-1).
--
-- Aditiva, reversible (DROP COLUMN + DROP CONSTRAINT + DROP INDEX).
-- Idempotente. Sin backfill: es un concepto nuevo, no hay historia previa
-- que reconstruir (ADR-MIGRACION-001, "no inventar historia").

ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "pedidoOrigenId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Pedido_pedidoOrigenId_fkey'
  ) THEN
    -- ON DELETE RESTRICT: preserva la trazabilidad — nunca se puede borrar
    -- el Pedido original mientras exista un relacionado apuntándolo.
    ALTER TABLE "Pedido"
      ADD CONSTRAINT "Pedido_pedidoOrigenId_fkey"
      FOREIGN KEY ("pedidoOrigenId") REFERENCES "Pedido"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Pedido_pedidoOrigenId_idx" ON "Pedido"("pedidoOrigenId");
