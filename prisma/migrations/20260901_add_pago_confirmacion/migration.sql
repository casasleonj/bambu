-- Migration: add_pago_confirmacion
-- Date: 2026-09-01
-- Purpose: ADR-PAGO-REPORTADO-CONFIRMADO-001 — estado de confirmación en `Pago`.
--   Señal ORTOGONAL al saldo: "¿este dinero fue verificado?" El detalle de una
--   discrepancia NO va acá (vive en el ResponsibilityCase).
--
-- Aditiva, reversible (DROP COLUMN x3 + DROP TYPE). Idempotente.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoConfirmacionPago') THEN
    CREATE TYPE "EstadoConfirmacionPago" AS ENUM ('REPORTADO', 'CONFIRMADO', 'DISCREPANTE');
  END IF;
END $$;

ALTER TABLE "Pago"
  ADD COLUMN IF NOT EXISTS "confirmacion" "EstadoConfirmacionPago" NOT NULL DEFAULT 'REPORTADO',
  ADD COLUMN IF NOT EXISTS "confirmadoPorId" TEXT,
  ADD COLUMN IF NOT EXISTS "confirmadoAt" TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Pago_confirmadoPorId_fkey'
  ) THEN
    ALTER TABLE "Pago"
      ADD CONSTRAINT "Pago_confirmadoPorId_fkey"
      FOREIGN KEY ("confirmadoPorId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Pago_confirmacion_idx" ON "Pago"("confirmacion");

-- Backfill (ADR-MIGRACION-001): todo `Pago` anterior a la migración → CONFIRMADO.
-- Racional: son pagos ya conciliados por cierres pasados; marcarlos REPORTADO
-- inundaría la cola de confirmación con historia sin valor. `confirmadoPorId = NULL`
-- deja explícito que fue backfill, no una confirmación humana real.
-- Idempotente: tras correr, no quedan filas REPORTADO pre-migración que re-tocar.
UPDATE "Pago"
SET "confirmacion" = 'CONFIRMADO',
    "confirmadoAt" = "createdAt"
WHERE "confirmacion" = 'REPORTADO';

-- GRANT para el rol de runtime (app_write en Docker; no-op si no existe).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    GRANT SELECT, INSERT, UPDATE ON "Pago" TO app_write;
  END IF;
END $$;
