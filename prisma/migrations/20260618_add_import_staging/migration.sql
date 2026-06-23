-- Migration: add ImportBatch / ImportStagingRow / ImportStagingContacto
-- plus fuente on Pedido, esPagoPersonal on Gasto and necesitaValidacion on CierreDia.
--
-- These tables form the staging area for bulk historical imports from paper/Excel.
-- Nothing in this migration touches production data; all changes are additive.

-- 0. Enable pg_trgm (required by the matcher for similarity())
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ImportBatchEstado') THEN
    CREATE TYPE "ImportBatchEstado" AS ENUM ('DRAFT', 'ANALYZED', 'COMMITTING', 'COMPLETED', 'FAILED', 'CANCELLED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ImportEntity') THEN
    CREATE TYPE "ImportEntity" AS ENUM ('CLIENTE', 'PEDIDO', 'PAGO', 'EMBARQUE', 'PRODUCCION', 'GASTO', 'CIERRE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ImportDecision') THEN
    CREATE TYPE "ImportDecision" AS ENUM ('PENDING', 'AUTO_MERGE', 'MANUAL_MERGE', 'CREATE_NEW', 'SKIP');
  END IF;
END $$;

-- 2. Additive columns on existing tables
ALTER TABLE "Pedido"
  ADD COLUMN IF NOT EXISTS "fuente" TEXT;

ALTER TABLE "Gasto"
  ADD COLUMN IF NOT EXISTS "esPagoPersonal" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CierreDia"
  ADD COLUMN IF NOT EXISTS "necesitaValidacion" BOOLEAN NOT NULL DEFAULT false;

-- 3. Staging tables
CREATE TABLE IF NOT EXISTS "ImportBatch" (
  "id" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "estado" "ImportBatchEstado" NOT NULL DEFAULT 'DRAFT',
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "autoMergedRows" INTEGER NOT NULL DEFAULT 0,
  "manualMergedRows" INTEGER NOT NULL DEFAULT 0,
  "createdRows" INTEGER NOT NULL DEFAULT 0,
  "skippedRows" INTEGER NOT NULL DEFAULT 0,
  "errorRows" INTEGER NOT NULL DEFAULT 0,
  "reportJson" JSONB,
  "errorJson" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ImportStagingRow" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "entity" "ImportEntity" NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "rawJson" JSONB NOT NULL,
  "normalizedJson" JSONB,
  "parseError" TEXT,
  "matchCandidates" JSONB,
  "decision" "ImportDecision" NOT NULL DEFAULT 'PENDING',
  "targetId" TEXT,
  "createdId" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "ImportStagingRow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ImportStagingContacto" (
  "id" TEXT NOT NULL,
  "stagingRowId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "telefono" TEXT NOT NULL,
  "relacion" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "ImportStagingContacto_pkey" PRIMARY KEY ("id")
);

-- 4. Foreign keys (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ImportBatch_createdById_fkey'
  ) THEN
    ALTER TABLE "ImportBatch"
      ADD CONSTRAINT "ImportBatch_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ImportStagingRow_batchId_fkey'
  ) THEN
    ALTER TABLE "ImportStagingRow"
      ADD CONSTRAINT "ImportStagingRow_batchId_fkey"
      FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id")
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ImportStagingContacto_stagingRowId_fkey'
  ) THEN
    ALTER TABLE "ImportStagingContacto"
      ADD CONSTRAINT "ImportStagingContacto_stagingRowId_fkey"
      FOREIGN KEY ("stagingRowId") REFERENCES "ImportStagingRow"("id")
      ON DELETE CASCADE;
  END IF;
END $$;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS "ImportBatch_createdById_idx" ON "ImportBatch" ("createdById");
CREATE INDEX IF NOT EXISTS "ImportBatch_estado_idx" ON "ImportBatch" ("estado");

CREATE INDEX IF NOT EXISTS "ImportStagingRow_batchId_idx" ON "ImportStagingRow" ("batchId");
CREATE INDEX IF NOT EXISTS "ImportStagingRow_batchId_entity_idx" ON "ImportStagingRow" ("batchId", "entity");
CREATE INDEX IF NOT EXISTS "ImportStagingRow_batchId_decision_idx" ON "ImportStagingRow" ("batchId", "decision");

CREATE INDEX IF NOT EXISTS "ImportStagingContacto_stagingRowId_idx" ON "ImportStagingContacto" ("stagingRowId");

-- 6. Grants for runtime user (local Docker uses app_write)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ImportBatch" TO app_write;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ImportStagingRow" TO app_write;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ImportStagingContacto" TO app_write;
  END IF;
END $$;
