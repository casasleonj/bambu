-- #644 — Frecuencia de pago del sueldo fijo por trabajador.
--
--   Trabajador.frecuenciaPago: SEMANAL (diasPago = días de la semana 0-6, 0 = domingo), QUINCENAL (15 y último
--   día del mes), MENSUAL (diasPago[0] = día del mes) o FECHAS (diasPago = días del mes). NULL = comportamiento
--   anterior (el sueldo fijo se suma una vez por nómina).
--   Trabajador.frecuenciaDesde: desde cuándo rige el plan (no se listan pagos anteriores como pendientes).
--   Trabajador.pagoFueraDeCaja: su pago se registra en la nómina pero no baja el efectivo de la caja (p. ej. el administrador).
--
-- Solo agrega un tipo, columnas nulables / con DEFAULT: el código anterior sigue funcionando con la base migrada.
-- Idempotente: producción la recibe aparte ANTES del merge (incidente #350).

DO $$ BEGIN
  CREATE TYPE "FrecuenciaPago" AS ENUM ('SEMANAL', 'QUINCENAL', 'MENSUAL', 'FECHAS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Trabajador" ADD COLUMN IF NOT EXISTS "frecuenciaPago" "FrecuenciaPago";
ALTER TABLE "Trabajador" ADD COLUMN IF NOT EXISTS "diasPago" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "Trabajador" ADD COLUMN IF NOT EXISTS "frecuenciaDesde" TIMESTAMPTZ;
ALTER TABLE "Trabajador" ADD COLUMN IF NOT EXISTS "pagoFueraDeCaja" BOOLEAN NOT NULL DEFAULT false;
