-- Migration: backfill_pedido_estadoentrega
-- Date: 2026-09-01
-- Purpose: G5.2 (ADR-PEDIDO-ESTADO-CANONICO-001, fase B). Los lectores de
--   Pedido pasan de la columna legacy `estado` a `estadoEntrega`. Ambas son
--   enums idénticos, mantenidos en sync por PedidoMapper, pero `estadoEntrega`
--   se agregó vía `db push` con `@default(PENDIENTE)` y SIN backfill — filas
--   creadas antes del dual-write (o nunca re-guardadas) podían tener
--   `estado <> estadoEntrega`.
--
--   Este backfill cierra el gate de la fase B: tras correrlo,
--   `SELECT count(*) FROM "Pedido" WHERE estado::text <> "estadoEntrega"::text` = 0.
--
-- Idempotente. Reversible (el inverso es el mismo UPDATE con las columnas
--   intercambiadas, pero `estado` sigue dual-escrito así que no hace falta).

UPDATE "Pedido"
SET "estadoEntrega" = "estado"::text::"EstadoEntrega"
WHERE "estadoEntrega"::text <> "estado"::text;

-- Índices compuestos sobre `estadoEntrega` que reemplazan a los de `estado`
-- que servían las queries migradas (cierre/reportes/forecast: estadoEntrega +
-- fecha; optimize-ruta: embarqueId + estadoEntrega). `[clienteId, estadoEntrega]`
-- ya está cubierto por el prefijo de `@@index([clienteId, estadoEntrega, estadoPago])`.
CREATE INDEX IF NOT EXISTS "Pedido_estadoEntrega_fecha_idx" ON "Pedido"("estadoEntrega", "fecha");
CREATE INDEX IF NOT EXISTS "Pedido_embarqueId_estadoEntrega_idx" ON "Pedido"("embarqueId", "estadoEntrega");
