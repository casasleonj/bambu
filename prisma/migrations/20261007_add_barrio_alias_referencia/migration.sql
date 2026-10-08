-- Migration: add_barrio_alias_referencia
-- Date: 2026-10-07
-- Purpose: F4 (fase separada, post-F3) — "Barrio: nombres alternativos y
--   referencias territoriales". Introduce `BarrioAlias` (otro nombre que
--   IDENTIFICA al mismo Barrio, unicidad global) y `BarrioReferencia`
--   (ayuda a ubicar dentro del Barrio, no única entre Barrios distintos).
--
-- Dos tablas en vez de una con enum + índice único condicionado: Prisma
-- 6.19.3 (pineado) no soporta índices únicos parciales en schema.prisma
-- (llegó recién como preview feature en Prisma 7.4.0, fuera de alcance).
-- Aplicar el parcial solo vía SQL crudo es inseguro bajo el flujo `db push`
-- de este repo (Known Issue #12) — puede dropearse en la próxima
-- sincronización por no estar representado en el schema. Separar en dos
-- modelos nativos evita el problema de raíz.
--
-- Fuera de alcance: sector, urbanización, vía, equipamiento, corredor,
-- punto de interés. Esta migración NO toca Cliente, Negocio, Pedido, Zona
-- ni ZonaBarrio salvo la FK inversa hacia Barrio.
--
-- Aditiva, reversible (DROP TABLE). Idempotente (IF NOT EXISTS en todo)
-- para poder aplicarse a mano con psql en dev sin chocar con
-- `prisma db push`.

-- CreateTable
CREATE TABLE IF NOT EXISTS "BarrioAlias" (
    "id" TEXT NOT NULL,
    "barrioId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "textoNormalizado" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BarrioAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BarrioAlias_textoNormalizado_key" ON "BarrioAlias"("textoNormalizado");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BarrioAlias_barrioId_idx" ON "BarrioAlias"("barrioId");

-- CreateTable
CREATE TABLE IF NOT EXISTS "BarrioReferencia" (
    "id" TEXT NOT NULL,
    "barrioId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "textoNormalizado" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BarrioReferencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BarrioReferencia_barrioId_textoNormalizado_key" ON "BarrioReferencia"("barrioId", "textoNormalizado");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BarrioReferencia_textoNormalizado_idx" ON "BarrioReferencia"("textoNormalizado");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'BarrioAlias_barrioId_fkey'
  ) THEN
    ALTER TABLE "BarrioAlias"
      ADD CONSTRAINT "BarrioAlias_barrioId_fkey"
      FOREIGN KEY ("barrioId") REFERENCES "Barrio"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'BarrioReferencia_barrioId_fkey'
  ) THEN
    ALTER TABLE "BarrioReferencia"
      ADD CONSTRAINT "BarrioReferencia_barrioId_fkey"
      FOREIGN KEY ("barrioId") REFERENCES "Barrio"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Grants (Known Issue #12/permisos): el usuario de runtime (app_write en
-- Docker, postgres en Supabase) necesita GRANT explícito sobre las tablas
-- nuevas porque ALTER DEFAULT PRIVILEGES no siempre se propaga a tablas
-- creadas por migraciones posteriores.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "BarrioAlias" TO app_write';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "BarrioReferencia" TO app_write';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_read') THEN
    EXECUTE 'GRANT SELECT ON TABLE "BarrioAlias" TO app_read';
    EXECUTE 'GRANT SELECT ON TABLE "BarrioReferencia" TO app_read';
  END IF;
END $$;
