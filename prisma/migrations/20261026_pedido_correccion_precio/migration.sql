-- ADR-MONETARIO-002 §1 / ADR-CIERRE-004 — Fase D del cierre V2: corrección de precio de
-- una línea del pedido con recálculo (el ASISTENTE solicita, el ADMIN aplica).
--
-- Solo agrega (enum + tabla nueva): el código anterior sigue funcionando con la base
-- migrada. Sin backfill. Idempotente: CI la aplica después de `prisma db push` y
-- producción la recibe aparte ANTES del merge (AGENTS.md, Flujo de Entrega, paso 7).
-- Nombres de índices y FKs iguales a los que genera Prisma.

DO $$ BEGIN
  CREATE TYPE "PedidoCorreccionPrecioEstado" AS ENUM ('PENDIENTE', 'APLICADA', 'RECHAZADA');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PedidoCorreccionPrecio" (
  "id"              TEXT NOT NULL,
  "pedidoId"        TEXT NOT NULL,
  "producto"        TEXT NOT NULL,
  "cantidad"        INTEGER NOT NULL,
  "precioAnterior"  DECIMAL(10,2) NOT NULL,
  "precioNuevo"     DECIMAL(10,2) NOT NULL,
  "delta"           DECIMAL(10,2) NOT NULL,
  "precioRaro"      BOOLEAN NOT NULL DEFAULT false,
  "motivo"          TEXT NOT NULL,
  "estado"          "PedidoCorreccionPrecioEstado" NOT NULL DEFAULT 'PENDIENTE',
  "solicitadoPorId" TEXT NOT NULL,
  "solicitadoAt"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resueltoPorId"   TEXT,
  "resueltoAt"      TIMESTAMPTZ,
  "notaResolucion"  TEXT,
  "totalAntes"      DECIMAL(10,2),
  "totalDespues"    DECIMAL(10,2),
  "offlineId"       TEXT,
  CONSTRAINT "PedidoCorreccionPrecio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PedidoCorreccionPrecio_offlineId_key" ON "PedidoCorreccionPrecio"("offlineId");
CREATE INDEX IF NOT EXISTS "PedidoCorreccionPrecio_pedidoId_idx" ON "PedidoCorreccionPrecio"("pedidoId");
CREATE INDEX IF NOT EXISTS "PedidoCorreccionPrecio_estado_idx" ON "PedidoCorreccionPrecio"("estado");
CREATE INDEX IF NOT EXISTS "PedidoCorreccionPrecio_solicitadoPorId_idx" ON "PedidoCorreccionPrecio"("solicitadoPorId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PedidoCorreccionPrecio_pedidoId_fkey') THEN
    ALTER TABLE "PedidoCorreccionPrecio"
      ADD CONSTRAINT "PedidoCorreccionPrecio_pedidoId_fkey"
      FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PedidoCorreccionPrecio_solicitadoPorId_fkey') THEN
    ALTER TABLE "PedidoCorreccionPrecio"
      ADD CONSTRAINT "PedidoCorreccionPrecio_solicitadoPorId_fkey"
      FOREIGN KEY ("solicitadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PedidoCorreccionPrecio_resueltoPorId_fkey') THEN
    ALTER TABLE "PedidoCorreccionPrecio"
      ADD CONSTRAINT "PedidoCorreccionPrecio_resueltoPorId_fkey"
      FOREIGN KEY ("resueltoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
