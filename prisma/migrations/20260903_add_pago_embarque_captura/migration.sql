-- Migration: add_pago_embarque_captura
-- Date: 2026-09-03
-- Purpose: ADR-PAGO-EMBARQUE-CAPTURA-001 — `Pago.embarqueId` = contexto físico
--   de captura del pago (el embarque en el que se recibió el dinero, NO el del
--   pedido). `null` = pago no capturado dentro de un embarque. INMUTABLE.
--
-- Aditiva, reversible (DROP COLUMN + DROP INDEX + DROP CONSTRAINT).
-- Idempotente.
-- Backfill: NINGUNO (los cierres históricos ya están conciliados; re-atribuir
--   pagos históricos no cambia nada cerrado y arriesga inconsistencias).
-- GRANT: NO se necesita — `app_write` ya tiene INSERT/UPDATE sobre "Pago" y la
--   columna es nullable; la FK se crea con el usuario de migración.

ALTER TABLE "Pago" ADD COLUMN IF NOT EXISTS "embarqueId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Pago_embarqueId_fkey'
  ) THEN
    -- ON DELETE SET NULL: un Embarque ABIERTO/EN_RUTA (nunca conciliado) puede
    -- borrarse sin destruir historia. Un Embarque CERRADO con dinero conciliado
    -- NO se borra físicamente (regla en ADR-CIERRE-001, no acá).
    ALTER TABLE "Pago"
      ADD CONSTRAINT "Pago_embarqueId_fkey"
      FOREIGN KEY ("embarqueId") REFERENCES "Embarque"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Pago_embarqueId_idx" ON "Pago"("embarqueId");
