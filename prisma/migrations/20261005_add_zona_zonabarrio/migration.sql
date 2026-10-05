-- Migration: add_zona_zonabarrio
-- Date: 2026-10-05
-- Purpose: F3 del ALS/Plan Técnico "Barrio canónico + Zona territorial" —
--   introduce `Zona` y el join explícito `ZonaBarrio` (M:N, P2 del ALS: "un
--   barrio puede pertenecer a múltiples zonas, la relación compartida es
--   válida"). `ZonaBarrio` lleva metadata de procedencia (`source`,
--   `createdBy`) para el contrato de auditoría del ALS §11.
--
-- Fuera de alcance: UX de solapamiento más allá del contrato de API (F4),
-- integración Cliente/Negocio (F5), integración Planificador (F6), offline
-- (F7). Esta migración NO toca Barrio, Cliente, Negocio, Pedido ni ninguna
-- tabla existente salvo para agregar la FK inversa de ZonaBarrio -> Barrio.
--
-- Aditiva, reversible (DROP TABLE). Idempotente (IF NOT EXISTS en todo)
-- para poder aplicarse a mano con psql en dev sin chocar con
-- `prisma db push` (Known Issue #12 de AGENTS.md).

-- CreateTable
CREATE TABLE IF NOT EXISTS "Zona" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombreNormalizado" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Zona_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Zona_nombreNormalizado_key" ON "Zona"("nombreNormalizado");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Zona_activo_idx" ON "Zona"("activo");

-- CreateTable
CREATE TABLE IF NOT EXISTS "ZonaBarrio" (
    "zonaId" TEXT NOT NULL,
    "barrioId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'USER',
    "createdBy" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ZonaBarrio_zonaId_barrioId_key" ON "ZonaBarrio"("zonaId", "barrioId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ZonaBarrio_zonaId_idx" ON "ZonaBarrio"("zonaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ZonaBarrio_barrioId_idx" ON "ZonaBarrio"("barrioId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ZonaBarrio_zonaId_fkey'
  ) THEN
    ALTER TABLE "ZonaBarrio"
      ADD CONSTRAINT "ZonaBarrio_zonaId_fkey"
      FOREIGN KEY ("zonaId") REFERENCES "Zona"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ZonaBarrio_barrioId_fkey'
  ) THEN
    ALTER TABLE "ZonaBarrio"
      ADD CONSTRAINT "ZonaBarrio_barrioId_fkey"
      FOREIGN KEY ("barrioId") REFERENCES "Barrio"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Grants (Known Issue #12/permisos, ver 20260910_add_barrio_canonico): el
-- usuario de runtime (app_write en Docker, postgres en Supabase) necesita
-- GRANT explícito sobre las tablas nuevas porque ALTER DEFAULT PRIVILEGES
-- no siempre se propaga a tablas creadas por migraciones posteriores.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Zona" TO app_write';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ZonaBarrio" TO app_write';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_read') THEN
    EXECUTE 'GRANT SELECT ON TABLE "Zona" TO app_read';
    EXECUTE 'GRANT SELECT ON TABLE "ZonaBarrio" TO app_read';
  END IF;
END $$;
