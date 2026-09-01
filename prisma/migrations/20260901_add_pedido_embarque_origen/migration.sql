-- Migration: add_pedido_embarque_origen
-- Date: 2026-09-01
-- Purpose: ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001 — `Pedido.embarqueOrigenId`
--   conserva el embarque en el que se ORIGINÓ una venta en ruta. Inmutable:
--   a diferencia de `embarqueId` (asignación física actual, se limpia al
--   reasignar en NO_ENTREGADO), `embarqueOrigenId` nunca se borra.
--
-- Aditiva, reversible (DROP COLUMN + DROP INDEX).
-- Idempotente.

ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "embarqueOrigenId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Pedido_embarqueOrigenId_fkey'
  ) THEN
    -- ON DELETE RESTRICT: `embarqueOrigenId` es un registro histórico inmutable.
    -- Un hard-delete de un Embarque que originó ventas se bloquea a nivel DB.
    -- El flujo normal (cancelar embarque = soft-delete estado=CANCELADO) no
    -- dispara la FK.
    ALTER TABLE "Pedido"
      ADD CONSTRAINT "Pedido_embarqueOrigenId_fkey"
      FOREIGN KEY ("embarqueOrigenId") REFERENCES "Embarque"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Pedido_embarqueOrigenId_idx" ON "Pedido"("embarqueOrigenId");

-- Backfill (ADR-MIGRACION-001, no inventa historia): los pedidos VENTA_LIBRE
-- históricos que todavía tienen `embarqueId` (nunca se reasignaron) nacieron
-- en ese embarque → se copia. Los que ya perdieron `embarqueId` quedan NULL
-- (no hay dato fiable de origen).
UPDATE "Pedido"
SET "embarqueOrigenId" = "embarqueId"
WHERE "origen" = 'VENTA_LIBRE'
  AND "embarqueId" IS NOT NULL
  AND "embarqueOrigenId" IS NULL;
