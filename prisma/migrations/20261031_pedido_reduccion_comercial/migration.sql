-- #451 / ADR-REDUCCION-COMERCIAL-001 — reducción comercial aceptada («el cliente ya no
-- quiere el resto») con comando económico propio.
--
-- Solo agrega (enum + columna con default + tabla nueva): el código anterior sigue
-- funcionando con la base migrada. Sin backfill. Idempotente: CI la aplica después de
-- `prisma db push` y producción la recibe aparte ANTES del merge (AGENTS.md, paso 7).
-- Nombres de índices y FKs iguales a los que genera Prisma.

DO $$ BEGIN
  CREATE TYPE "PedidoReduccionComercialEstado" AS ENUM ('PENDIENTE', 'APLICADA', 'RECHAZADA');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "puedeAutorizarReduccionComercial" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "PedidoReduccionComercial" (
  "id"                TEXT NOT NULL,
  "pedidoId"          TEXT NOT NULL,
  "producto"          TEXT NOT NULL,
  "cantidadReducida"  INTEGER NOT NULL,
  "cantPedidoAntes"   INTEGER NOT NULL,
  "cantPedidoDespues" INTEGER NOT NULL,
  "precio"            DECIMAL(10,2) NOT NULL,
  "monto"             DECIMAL(10,2) NOT NULL,
  "motivo"            TEXT NOT NULL,
  "aceptadoPor"       TEXT NOT NULL,
  "medio"             TEXT NOT NULL,
  "estado"            "PedidoReduccionComercialEstado" NOT NULL DEFAULT 'PENDIENTE',
  "solicitadoPorId"   TEXT NOT NULL,
  "solicitadoAt"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resueltoPorId"     TEXT,
  "resueltoAt"        TIMESTAMPTZ,
  "notaResolucion"    TEXT,
  "totalAntes"        DECIMAL(10,2),
  "totalDespues"      DECIMAL(10,2),
  "notaCreditoId"     TEXT,
  "offlineId"         TEXT,
  CONSTRAINT "PedidoReduccionComercial_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PedidoReduccionComercial_notaCreditoId_key" ON "PedidoReduccionComercial"("notaCreditoId");
CREATE UNIQUE INDEX IF NOT EXISTS "PedidoReduccionComercial_offlineId_key" ON "PedidoReduccionComercial"("offlineId");
CREATE INDEX IF NOT EXISTS "PedidoReduccionComercial_pedidoId_idx" ON "PedidoReduccionComercial"("pedidoId");
CREATE INDEX IF NOT EXISTS "PedidoReduccionComercial_estado_idx" ON "PedidoReduccionComercial"("estado");
CREATE INDEX IF NOT EXISTS "PedidoReduccionComercial_solicitadoPorId_idx" ON "PedidoReduccionComercial"("solicitadoPorId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PedidoReduccionComercial_pedidoId_fkey') THEN
    ALTER TABLE "PedidoReduccionComercial"
      ADD CONSTRAINT "PedidoReduccionComercial_pedidoId_fkey"
      FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PedidoReduccionComercial_solicitadoPorId_fkey') THEN
    ALTER TABLE "PedidoReduccionComercial"
      ADD CONSTRAINT "PedidoReduccionComercial_solicitadoPorId_fkey"
      FOREIGN KEY ("solicitadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PedidoReduccionComercial_resueltoPorId_fkey') THEN
    ALTER TABLE "PedidoReduccionComercial"
      ADD CONSTRAINT "PedidoReduccionComercial_resueltoPorId_fkey"
      FOREIGN KEY ("resueltoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PedidoReduccionComercial_notaCreditoId_fkey') THEN
    ALTER TABLE "PedidoReduccionComercial"
      ADD CONSTRAINT "PedidoReduccionComercial_notaCreditoId_fkey"
      FOREIGN KEY ("notaCreditoId") REFERENCES "NotaCredito"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
