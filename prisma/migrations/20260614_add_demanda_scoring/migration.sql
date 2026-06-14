-- Migration: add_demanda_scoring
-- Date: 2026-06-14
-- Purpose: Bloque 3 — agregar columnas de predicción de demanda a Cliente.
--   El cron diario (POST /api/cron/recompute-scores) computa estos campos
--   desde el historial de Pedidos. La UI /sugerencias-llamadas los lee
--   ordenados por scoreLlamada desc.
--
-- Aditivo: nullable, sin defaults intrusivos. Backward-compatible.
-- Grants explícitos para app_write (la API escribe) y app_read.

ALTER TABLE "Cliente"
  ADD COLUMN "intervaloMediano"    INT,
  ADD COLUMN "proxEsperada"        TIMESTAMPTZ,
  ADD COLUMN "diasAtraso"          INT,
  ADD COLUMN "scoreLlamada"        DECIMAL(8, 2),
  ADD COLUMN "valorTipico"         DECIMAL(10, 2),
  ADD COLUMN "scoreRecalculadoEn"  TIMESTAMPTZ,
  ADD COLUMN "ultimaLlamada"       TIMESTAMPTZ;

-- Índices para queries frecuentes.
CREATE INDEX "Cliente_scoreLlamada_idx" ON "Cliente" ("scoreLlamada" DESC) WHERE "scoreLlamada" IS NOT NULL;
CREATE INDEX "Cliente_diasAtraso_idx" ON "Cliente" ("diasAtraso" DESC) WHERE "diasAtraso" IS NOT NULL;
CREATE INDEX "Cliente_proxEsperada_idx" ON "Cliente" ("proxEsperada") WHERE "proxEsperada" IS NOT NULL;

-- Grants (idempotente).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Cliente" TO app_write;
GRANT SELECT ON TABLE "Cliente" TO app_read;
