-- Migration: add_barrio_canonico
-- Date: 2026-09-10
-- Purpose: F1 del ALS "Barrio canónico + Zona territorial" — introduce
--   `Barrio` como catálogo canónico y `Cliente.barrioId`/`Negocio.barrioId`
--   como referencia opcional. Los campos legacy `Cliente.barrio` y
--   `Negocio.barrio` (texto libre) NO se tocan: siguen siendo la fuente que
--   leen el planificador y route-analysis.ts durante esta fase.
--
-- Fuera de alcance: Zona, ZonaBarrio, Municipio, Pedido.barrioId, backfill
-- masivo de barrioId sobre registros existentes (queda para F2).
--
-- Aditiva, reversible (DROP COLUMN + DROP CONSTRAINT + DROP TABLE).
-- Idempotente (IF NOT EXISTS en todo) para poder aplicarse a mano con psql
-- en dev sin chocar con `prisma db push` (Known Issue #12 de AGENTS.md).

-- CreateTable
CREATE TABLE IF NOT EXISTS "Barrio" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombreNormalizado" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Barrio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Barrio_nombreNormalizado_key" ON "Barrio"("nombreNormalizado");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Barrio_activo_idx" ON "Barrio"("activo");

-- AlterTable: Cliente.barrioId
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "barrioId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Cliente_barrioId_fkey'
  ) THEN
    ALTER TABLE "Cliente"
      ADD CONSTRAINT "Cliente_barrioId_fkey"
      FOREIGN KEY ("barrioId") REFERENCES "Barrio"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Cliente_barrioId_idx" ON "Cliente"("barrioId");

-- AlterTable: Negocio.barrioId
ALTER TABLE "Negocio" ADD COLUMN IF NOT EXISTS "barrioId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Negocio_barrioId_fkey'
  ) THEN
    ALTER TABLE "Negocio"
      ADD CONSTRAINT "Negocio_barrioId_fkey"
      FOREIGN KEY ("barrioId") REFERENCES "Barrio"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Negocio_barrioId_idx" ON "Negocio"("barrioId");

-- Grants (Known Issue #12/permisos, ver 20260611_grant_contacto_plantilla_app_write):
-- el usuario de runtime (app_write en Docker, postgres en Supabase) necesita
-- GRANT explícito sobre la tabla nueva porque ALTER DEFAULT PRIVILEGES no
-- siempre se propaga a tablas creadas por migraciones posteriores.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Barrio" TO app_write';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_read') THEN
    EXECUTE 'GRANT SELECT ON TABLE "Barrio" TO app_read';
  END IF;
END $$;
