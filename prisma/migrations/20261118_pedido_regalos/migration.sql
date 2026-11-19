-- #795. Expansión aditiva basada en prisma migrate diff (Prisma 6.19.3).
-- No deducir regalos a partir de precios ni modificar importes históricos.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE "PedidoItem"
  ADD COLUMN IF NOT EXISTS "cantRegaloPedido" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cantRegaloEntrega" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "regaloAutorizadoPorId" TEXT,
  ADD COLUMN IF NOT EXISTS "regaloAutorizadoEn" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "regaloMotivo" TEXT;

CREATE INDEX IF NOT EXISTS "PedidoItem_regaloAutorizadoPorId_idx"
  ON "PedidoItem" ("regaloAutorizadoPorId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"PedidoItem"'::regclass AND conname = 'PedidoItem_regaloAutorizadoPorId_fkey') THEN
    ALTER TABLE "PedidoItem" ADD CONSTRAINT "PedidoItem_regaloAutorizadoPorId_fkey"
      FOREIGN KEY ("regaloAutorizadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"PedidoItem"'::regclass AND conname = 'PedidoItem_regalo_integridad_check') THEN
    ALTER TABLE "PedidoItem" ADD CONSTRAINT "PedidoItem_regalo_integridad_check" CHECK (
      "cantRegaloPedido" >= 0 AND "cantRegaloEntrega" >= 0
      AND "cantRegaloEntrega" <= "cantRegaloPedido"
      AND ("cantRegaloPedido" = 0 OR (
        "cantPedido" >= 0 AND "cantEntrega" >= 0 AND "cantEntrega" <= "cantPedido"
        AND "cantPedido"::bigint + "cantRegaloPedido"::bigint <= 2147483647
        AND "regaloAutorizadoPorId" IS NOT NULL AND length(btrim("regaloAutorizadoPorId")) > 0
        AND "regaloAutorizadoEn" IS NOT NULL AND isfinite("regaloAutorizadoEn")
        AND "regaloMotivo" IS NOT NULL AND length(btrim("regaloMotivo")) > 0
      ))
    );
  END IF;
END $$;
COMMIT;
