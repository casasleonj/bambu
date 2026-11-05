-- #645 — Concepto del pago de comisión: REPARTO (repartidor, por entregas) o PRODUCCION (sellador, por lo producido).
--
-- Un mismo trabajador puede cobrar las dos (sellador con moto) y cada pago debe verse en su bloque del cierre sin mezclarse.
-- Los pagos existentes quedan como REPARTO (eran todos de repartidores). El cierre, la nómina y la regla V16 siguen sumando
-- TODOS los pagos de la persona, sea cual sea el concepto.
--
-- Solo agrega una columna con DEFAULT: el código anterior sigue funcionando con la base migrada.
-- Idempotente: producción la recibe aparte ANTES del merge (incidente #350).

ALTER TABLE "PagoComisionRepartidor" ADD COLUMN IF NOT EXISTS "concepto" TEXT NOT NULL DEFAULT 'REPARTO';
