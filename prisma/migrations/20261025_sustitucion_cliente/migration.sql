-- #446 — Sustitucion.clienteId: permite atribuir un cambio a un cliente que no
-- tiene pedido en la ruta (hoy solo puede apuntar a un Pedido del embarque).
--
-- Solo agrega (columna NULL + índice + FK): el código anterior sigue funcionando
-- con la base migrada. Sin backfill. Idempotente: CI la aplica después de
-- `prisma db push` y producción la recibe aparte ANTES del merge (#359).
-- Nombres de índice y FK iguales a los que genera Prisma.

ALTER TABLE "Sustitucion" ADD COLUMN IF NOT EXISTS "clienteId" TEXT;
CREATE INDEX IF NOT EXISTS "Sustitucion_clienteId_idx" ON "Sustitucion"("clienteId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Sustitucion_clienteId_fkey') THEN
    ALTER TABLE "Sustitucion"
      ADD CONSTRAINT "Sustitucion_clienteId_fkey"
      FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
