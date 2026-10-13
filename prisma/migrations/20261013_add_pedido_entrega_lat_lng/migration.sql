-- Migration: add_pedido_entrega_lat_lng
-- Date: 2026-10-13
-- Purpose: Fase 2 de "suficiencia de domicilio" — ubicación geográfica del
--   DESTINO propia del Pedido (entregaLat/entregaLng), para que un pedido
--   DOMICILIO de CONSUMIDOR_FINAL (cliente canónico compartido, sin
--   domicilio propio) pueda quedar localizable por coordenadas.
--
-- NO es el GPS de comprobación de entrega (gpsLat/gpsLng): esos se capturan
-- al ENTREGAR y no se reutilizan como destino.
--
-- Aditiva, reversible (ALTER TABLE ... DROP COLUMN), idempotente
-- (IF NOT EXISTS). Sin backfill: los pedidos existentes quedan NULL y su
-- destino sigue resolviéndose desde negocio/cliente. No toca otras columnas.

ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "entregaLat" DECIMAL(10,6);
ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "entregaLng" DECIMAL(10,6);
