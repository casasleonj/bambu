-- Migration: add_geo_coords
-- Date: 2026-06-12
-- Purpose: Bloque 1 — agregar lat/lng + geocodeOrigen/geocodeAt a Cliente y Negocio.
--   Prepárate para clustering por cercanía (Bloque 2) y para el botón
--   "Actualizar coordenadas" en el admin.
--
-- Backfill: NO se hace en esta migración. El script `prisma/backfill-geo.ts`
--   (ver src/lib/geo/backfill-cliente-coords.ts) corre aparte después del
--   `db push` y procesa cliente por cliente: linkUbicacion → GPS historial
--   → Negocio → null.
--
-- Aditivos (no破坏 nada): las columnas son nullable, no hay DEFAULTs
-- intrusivos, no se modifican las existentes. Backward-compatible.
--
-- Grants: agregamos a app_read/app_write (mismo patrón que la migración
-- 20260611_grant_contacto_plantilla_app_write) porque las nuevas columnas
-- son consultadas/actualizadas por la API de geocode.

-- 1. Cliente: lat, lng, geocodeOrigen, geocodeAt
ALTER TABLE "Cliente"
  ADD COLUMN "lat" DECIMAL(10, 6),
  ADD COLUMN "lng" DECIMAL(10, 6),
  ADD COLUMN "geocodeOrigen" TEXT,
  ADD COLUMN "geocodeAt" TIMESTAMPTZ;

-- Index para queries de clustering + bounding box.
-- Index parcial (WHERE lat IS NOT NULL) para no inflar con clientes sin coords.
CREATE INDEX "Cliente_lat_lng_idx" ON "Cliente" ("lat", "lng") WHERE "lat" IS NOT NULL;

-- 2. Negocio: lat, lng
ALTER TABLE "Negocio"
  ADD COLUMN "lat" DECIMAL(10, 6),
  ADD COLUMN "lng" DECIMAL(10, 6);

CREATE INDEX "Negocio_lat_lng_idx" ON "Negocio" ("lat", "lng") WHERE "lat" IS NOT NULL;

-- 3. Grants explícitos para app_write (similar a la migración
-- 20260611_grant_contacto_plantilla_app_write). Idempotente.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Cliente" TO app_write;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Negocio" TO app_write;
GRANT SELECT ON TABLE "Cliente" TO app_read;
GRANT SELECT ON TABLE "Negocio" TO app_read;
