-- #641 — Medio de pago de la nómina.
--
--   Nomina.metodoPago: con qué se pagó (NULL = pagada antes de este cambio; su egreso ya quedó como Gasto).
--   Nomina.pagoFueraDeCaja: true si se pagó por fuera de la caja (p. ej. el sueldo del administrador).
--
-- Solo el pago en EFECTIVO y dentro de la caja genera el egreso (Gasto) que resta del cierre.
-- Solo agrega columnas nulables / con DEFAULT: el código anterior sigue funcionando con la base migrada.
-- Idempotente: producción la recibe aparte ANTES del merge (incidente #350).

ALTER TABLE "Nomina" ADD COLUMN IF NOT EXISTS "metodoPago" "MetodoPago";
ALTER TABLE "Nomina" ADD COLUMN IF NOT EXISTS "pagoFueraDeCaja" BOOLEAN NOT NULL DEFAULT false;
