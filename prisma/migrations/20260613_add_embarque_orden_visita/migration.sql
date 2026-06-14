-- Migration: add_embarque_orden_visita
-- Date: 2026-06-13
-- Purpose: Bloque 2 — persistir el orden de visita optimizado por TSP.
--   Cuando el admin llama POST /api/embarques/[id]/optimizar-orden, el
--   resultado (array de {pedidoId, orden, distanciaAcumulada}) se guarda
--   acá. El repartidor luego ve los pedidos en ese orden.
--
-- Aditivo: columnas nullable. No破坏 nada. Backward-compatible.
-- Grants explícitos para app_write (la API escribe) y app_read.

ALTER TABLE "Embarque"
  ADD COLUMN "ordenVisita" JSONB,
  ADD COLUMN "optimizadoEn" TIMESTAMPTZ;

-- Index GIN sobre el JSONB para queries del tipo "todos los embarques
-- optimizados hoy". En la práctica, no es crítico (la app hace fetch
-- por id), pero deja la puerta abierta para reportes.
CREATE INDEX "Embarque_ordenVisita_gin_idx" ON "Embarque" USING GIN ("ordenVisita");

-- Grants (idempotente, mismo patrón que migración anterior).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Embarque" TO app_write;
GRANT SELECT ON TABLE "Embarque" TO app_read;
