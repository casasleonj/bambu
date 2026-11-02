-- #305 — Medio de pago de la comisión del repartidor.
--
--   PagoComisionRepartidor.metodo: con qué se pagó (EFECTIVO por defecto). El cierre de caja
--   resta solo lo pagado en EFECTIVO; la nómina descuenta toda la comisión pagada, sea cual
--   sea el medio.
--
-- Solo agrega una columna con DEFAULT: los pagos que ya existen quedan como EFECTIVO (lo que el
-- cierre ya hacía) y el código anterior sigue funcionando con la base migrada. Idempotente:
-- producción la recibe aparte ANTES del merge (incidente #350).

ALTER TABLE "PagoComisionRepartidor"
  ADD COLUMN IF NOT EXISTS "metodo" "MetodoPago" NOT NULL DEFAULT 'EFECTIVO';
