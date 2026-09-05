-- Migration: add_actividad_modo_diferencial
-- Date: 2026-09-05
-- Purpose: N2 (docs/pedidos/AGUA_BAMBU_N2_ALS_v2.0.md §2) — `Actividad.modo`
--   (modo operativo ACTUAL de cumplimiento, PUNTO|DOMICILIO, distinto de
--   `Pedido.canal` que es histórico e inmutable) + `PedidoCantidadAjuste.
--   montoDiferencial` (registro del ajuste económico de un cambio de modo,
--   reutiliza la tabla existente en vez de una entidad paralela).
--
-- Aditiva, reversible (DROP COLUMN + DROP TYPE).
-- Idempotente.
-- Backfill: NINGUNO — no existe ninguna fila en "Actividad" en producción hoy
--   (cero callers de creación, ver AGUA_BAMBU_N2_MATRIZ_PLAN_CODIGO_v1.0.md),
--   así que no hay históricas que requieran un valor de `modo`.
-- GRANT: NO se necesita — `app_write` ya tiene INSERT/UPDATE sobre "Actividad"
--   y "PedidoCantidadAjuste"; las columnas nuevas son nullable.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ModoActividad') THEN
    CREATE TYPE "ModoActividad" AS ENUM ('PUNTO', 'DOMICILIO');
  END IF;
END $$;

ALTER TABLE "Actividad" ADD COLUMN IF NOT EXISTS "modo" "ModoActividad";

ALTER TABLE "PedidoCantidadAjuste" ADD COLUMN IF NOT EXISTS "montoDiferencial" DECIMAL(10,2);
