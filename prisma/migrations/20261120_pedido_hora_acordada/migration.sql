-- #836 F2b — «Hora acordada» del pedido (HH:MM de America/Bogota) para ordenar/agrupar por tiempo restante,
-- y su rastro en el historial de reprogramaciones.
-- ADITIVA e IDEMPOTENTE: solo columnas NULL nuevas y CHECK de formato. No toca ningún dato existente, y el
-- código anterior no las conoce, así que se puede aplicar en producción ANTES del despliegue.

ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "entregaNoAntesDe" TEXT;
ALTER TABLE "PedidoReprogramacion" ADD COLUMN IF NOT EXISTS "horaAnterior" TEXT;
ALTER TABLE "PedidoReprogramacion" ADD COLUMN IF NOT EXISTS "horaNueva" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pedido_entrega_no_antes_de') THEN
    ALTER TABLE "Pedido" ADD CONSTRAINT chk_pedido_entrega_no_antes_de CHECK (
      "entregaNoAntesDe" IS NULL OR "entregaNoAntesDe" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pedido_reprog_hora') THEN
    ALTER TABLE "PedidoReprogramacion" ADD CONSTRAINT chk_pedido_reprog_hora CHECK (
      ("horaAnterior" IS NULL OR "horaAnterior" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
      AND ("horaNueva" IS NULL OR "horaNueva" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    );
  END IF;
END $$;
