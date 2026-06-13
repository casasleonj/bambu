-- Migration: add PedidoItem.autorizadoPorAdmin + autorizadoPorId + autorizadoEn
-- commit 0c del plan antifraude: cuando un item tiene precioOrigen='manual',
-- la alerta CAMBIO_PRECIO_BRUSCO skipea SOLO si autorizadoPorAdmin=true.
-- Sin esta marca, cualquier precio manual es sospechoso.
--
-- autorizadoPorId es FK a User (nullable: defaults a false sin autorizador).
-- autorizadoEn guarda cuando se autorizo (timestamp para auditoria).

ALTER TABLE "PedidoItem"
  ADD COLUMN IF NOT EXISTS "autorizadoPorAdmin" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PedidoItem"
  ADD COLUMN IF NOT EXISTS "autorizadoPorId" TEXT;

ALTER TABLE "PedidoItem"
  ADD COLUMN IF NOT EXISTS "autorizadoEn" TIMESTAMPTZ;

-- FK constraint (defensivo: Prisma ya la crea en db push, pero la pongo
-- explicita para que el SQL sea autocontenido si se corre con psql).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PedidoItem_autorizadoPorId_fkey'
  ) THEN
    ALTER TABLE "PedidoItem"
      ADD CONSTRAINT "PedidoItem_autorizadoPorId_fkey"
      FOREIGN KEY ("autorizadoPorId") REFERENCES "User"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

-- Index para queries del detector (WHERE autorizadoPorAdmin = true)
CREATE INDEX IF NOT EXISTS "PedidoItem_autorizadoPorAdmin_idx"
  ON "PedidoItem" ("autorizadoPorAdmin");

-- Grant
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    GRANT SELECT, INSERT, UPDATE ON "PedidoItem" TO app_write;
  END IF;
END $$;
