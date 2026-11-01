-- #566: la deuda del trabajador guarda el pedido del que viene (solo «Fiado no cobrado»).
-- Aditiva e idempotente: no renombra ni borra nada, es compatible con el código anterior.

ALTER TABLE "DeudaTrabajador" ADD COLUMN IF NOT EXISTS "pedidoId" TEXT;

CREATE INDEX IF NOT EXISTS "DeudaTrabajador_pedidoId_idx" ON "DeudaTrabajador"("pedidoId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeudaTrabajador_pedidoId_fkey') THEN
    ALTER TABLE "DeudaTrabajador"
      ADD CONSTRAINT "DeudaTrabajador_pedidoId_fkey"
      FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Relleno de las deudas ya creadas por «Fiado no cobrado: Pedido #N (Cliente …)».
-- Solo se asigna cuando el pedido es inequívoco: mismo número Y mismo embarque que la deuda.
UPDATE "DeudaTrabajador" d
SET "pedidoId" = p."id"
FROM "Pedido" p
WHERE d."pedidoId" IS NULL
  AND d."embarqueId" IS NOT NULL
  AND d."descripcion" ~ '^Fiado no cobrado: Pedido #[0-9]+'
  AND p."numero" = (substring(d."descripcion" from '^Fiado no cobrado: Pedido #([0-9]+)'))::int
  AND p."embarqueId" = d."embarqueId"
  AND (
    SELECT count(*) FROM "Pedido" p2
    WHERE p2."numero" = p."numero" AND p2."embarqueId" = d."embarqueId"
  ) = 1;
