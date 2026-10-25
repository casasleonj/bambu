-- #472 — Gestión temporal de pedidos por el ADMIN sin embarque.
--
--   - Pedido.entregadoPorId → Trabajador: repartidor responsable de la entrega
--     que la oficina registró sin embarque (un solo repartidor por pedido).
--   - Pago.recibidoPorId    → Trabajador: quién recibió físicamente el dinero
--     (NULL = oficina o dato histórico).
--
-- Solo agrega (columnas NULL + índices + FKs con ON DELETE SET NULL): el código
-- anterior sigue funcionando con la base migrada. Sin backfill. Idempotente:
-- CI la aplica tras `prisma db push` y producción la recibe aparte ANTES del
-- merge (incidente #350). Nombres de índices y FKs iguales a los de Prisma.

ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "entregadoPorId" TEXT;
ALTER TABLE "Pago"   ADD COLUMN IF NOT EXISTS "recibidoPorId"  TEXT;

CREATE INDEX IF NOT EXISTS "Pedido_entregadoPorId_idx" ON "Pedido"("entregadoPorId");
CREATE INDEX IF NOT EXISTS "Pago_recibidoPorId_idx"    ON "Pago"("recibidoPorId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Pedido_entregadoPorId_fkey') THEN
    ALTER TABLE "Pedido"
      ADD CONSTRAINT "Pedido_entregadoPorId_fkey"
      FOREIGN KEY ("entregadoPorId") REFERENCES "Trabajador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Pago_recibidoPorId_fkey') THEN
    ALTER TABLE "Pago"
      ADD CONSTRAINT "Pago_recibidoPorId_fkey"
      FOREIGN KEY ("recibidoPorId") REFERENCES "Trabajador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
