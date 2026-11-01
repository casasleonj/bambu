-- #533 / ADR-SALDO-FAVOR-EXCEDENTE-001 — excedente de una corrección de precio o de una
-- reducción comercial trasladado del pedido al saldo a favor del cliente.
--
-- Solo agrega (enum + tabla nueva + CHECK): el código anterior sigue funcionando con la base
-- migrada. Sin backfill. Idempotente: CI la aplica después de `prisma db push` y producción
-- la recibe aparte ANTES del merge (AGENTS.md, paso 7).

DO $$ BEGIN
  CREATE TYPE "PedidoSaldoFavorMovimientoTipo" AS ENUM ('ACREDITACION', 'REAPLICACION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PedidoSaldoFavorMovimiento" (
  "id"         TEXT NOT NULL,
  "pedidoId"   TEXT NOT NULL,
  "clienteId"  TEXT NOT NULL,
  "tipo"       "PedidoSaldoFavorMovimientoTipo" NOT NULL,
  "monto"      DECIMAL(10,2) NOT NULL,
  "origenTipo" TEXT NOT NULL,
  "origenId"   TEXT NOT NULL,
  "motivo"     TEXT NOT NULL,
  "autorId"    TEXT NOT NULL,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PedidoSaldoFavorMovimiento_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_saldo_favor_mov_monto_pos" CHECK ("monto" > 0)
);

CREATE INDEX IF NOT EXISTS "PedidoSaldoFavorMovimiento_pedidoId_idx" ON "PedidoSaldoFavorMovimiento"("pedidoId");
CREATE INDEX IF NOT EXISTS "PedidoSaldoFavorMovimiento_clienteId_idx" ON "PedidoSaldoFavorMovimiento"("clienteId");
CREATE INDEX IF NOT EXISTS "PedidoSaldoFavorMovimiento_origenTipo_origenId_idx" ON "PedidoSaldoFavorMovimiento"("origenTipo", "origenId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PedidoSaldoFavorMovimiento_pedidoId_fkey') THEN
    ALTER TABLE "PedidoSaldoFavorMovimiento"
      ADD CONSTRAINT "PedidoSaldoFavorMovimiento_pedidoId_fkey"
      FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PedidoSaldoFavorMovimiento_autorId_fkey') THEN
    ALTER TABLE "PedidoSaldoFavorMovimiento"
      ADD CONSTRAINT "PedidoSaldoFavorMovimiento_autorId_fkey"
      FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
