-- Migration: add PrecioVolumen.precioMinimo
-- commit 0c del plan antifraude: umbral minimo para la alerta
-- PRECIO_POR_DEBAJO_TABLA. Si un PedidoItem.precio < PrecioVolumen.precioMinimo,
-- la alerta dispara. null = sin restriccion (alerta deshabilitada).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS no es SQL standard. Usamos
-- el patron de PG catalog (information_schema) que ya esta en uso
-- en otras migraciones del proyecto (ver 20260611_*).

ALTER TABLE "PrecioVolumen"
  ADD COLUMN IF NOT EXISTS "precioMinimo" DECIMAL(10, 2);

-- Grant al usuario app_write (sigue el patron de 20260611_grant_*)
-- Solo si el rol existe (defensivo: en CI con DB minima podria no existir)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    GRANT SELECT, INSERT, UPDATE ON "PrecioVolumen" TO app_write;
  END IF;
END $$;
