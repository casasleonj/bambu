-- Migration: add Caso.repartidorId + FK to Trabajador
-- commit 0c del plan antifraude: Caso se vuelve polimórfico tambien
-- sobre Trabajador. La alerta REPARTIDOR_DEUDA_ALTA (y futuras) crea
-- un Caso apuntando al repartidor (no al cliente).
--
-- Ademas: 2 indices UNIQUE PARCIALES (PostgreSQL) que implementan
-- el dedup del cron:
--   caso_dedup_abierto_cliente: 1 solo Caso ABIERTO por (clienteId, alertaTipo)
--   caso_dedup_abierto_repartidor: 1 solo Caso ABIERTO por (repartidorId, alertaTipo)
-- Esto previene que el cron cree Casos duplicados diariamente.

-- 1. Columna + FK
ALTER TABLE "Caso"
  ADD COLUMN IF NOT EXISTS "repartidorId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Caso_repartidorId_fkey'
  ) THEN
    ALTER TABLE "Caso"
      ADD CONSTRAINT "Caso_repartidorId_fkey"
      FOREIGN KEY ("repartidorId") REFERENCES "Trabajador"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Index regular (para queries WHERE repartidorId = X)
CREATE INDEX IF NOT EXISTS "Caso_repartidorId_idx"
  ON "Caso" ("repartidorId");

-- 3. UNIQUE PARCIALES (PostgreSQL soporta WHERE clause en indices).
-- WHERE status = 'ABIERTO' garantiza que solo los casos abiertos
-- son "unicos". Cerrados o resueltos se mantienen como historico.
--
-- Para cliente:
CREATE UNIQUE INDEX IF NOT EXISTS "caso_dedup_abierto_cliente_unique"
  ON "Caso" ("clienteId", "alertaTipo")
  WHERE "status" = 'ABIERTO' AND "clienteId" IS NOT NULL;

-- Para repartidor:
CREATE UNIQUE INDEX IF NOT EXISTS "caso_dedup_abierto_repartidor_unique"
  ON "Caso" ("repartidorId", "alertaTipo")
  WHERE "status" = 'ABIERTO' AND "repartidorId" IS NOT NULL;

-- 4. Grant
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    GRANT SELECT, INSERT, UPDATE ON "Caso" TO app_write;
  END IF;
END $$;
