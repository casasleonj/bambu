-- Migration: add_obligacion_reprogramacion
-- Date: 2026-09-15
-- Purpose: F4 de Integridad Comercial (Plan Maestro §61 — Cumplimiento,
--   bullet "reprogramación"). Permite cambiar la fecha objetivo de
--   cumplimiento de una ObligacionPendiente (remanente) sin crear un
--   Pedido/ObligacionPendiente nuevo y sin asignarla automáticamente a un
--   plan/ruta futuro. Historial append-only: cada reprogramación es su
--   propio hecho auditable, nunca se pisa ni se deduplica.
--
-- Aditiva, reversible (DROP TABLE + DROP COLUMN). Idempotente. Sin
-- backfill: entidad nueva, sin historia previa que reconstruir
-- (ADR-MIGRACION-001, "no inventar historia"); `fechaObjetivo` nace NULL
-- para todo remanente existente.

-- AlterTable
ALTER TABLE "ObligacionPendiente" ADD COLUMN IF NOT EXISTS "fechaObjetivo" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ObligacionPendienteReprogramacion" (
    "id" TEXT NOT NULL,
    "obligacionId" TEXT NOT NULL,
    "fechaAnterior" TIMESTAMPTZ,
    "fechaNueva" TIMESTAMPTZ NOT NULL,
    "motivo" TEXT,
    "reprogramadoPorId" TEXT NOT NULL,
    "reprogramadoAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offlineId" TEXT,

    CONSTRAINT "ObligacionPendienteReprogramacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ObligacionPendienteReprogramacion_offlineId_key" ON "ObligacionPendienteReprogramacion"("offlineId");
CREATE INDEX IF NOT EXISTS "ObligacionPendienteReprogramacion_obligacionId_idx" ON "ObligacionPendienteReprogramacion"("obligacionId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ObligacionPendienteReprogramacion_obligacionId_fkey') THEN
    ALTER TABLE "ObligacionPendienteReprogramacion" ADD CONSTRAINT "ObligacionPendienteReprogramacion_obligacionId_fkey" FOREIGN KEY ("obligacionId") REFERENCES "ObligacionPendiente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ObligacionPendienteReprogramacion_reprogramadoPorId_fkey') THEN
    ALTER TABLE "ObligacionPendienteReprogramacion" ADD CONSTRAINT "ObligacionPendienteReprogramacion_reprogramadoPorId_fkey" FOREIGN KEY ("reprogramadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
