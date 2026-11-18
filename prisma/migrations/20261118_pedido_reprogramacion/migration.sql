-- #836 F1 — Historial append-only de la fecha prometida de un pedido (reprogramaciones).
-- ADITIVA e IDEMPOTENTE: solo crea una tabla nueva; el código anterior no la conoce ni la necesita, así que se puede
-- aplicar en producción ANTES del despliegue. No toca ningún dato existente (no cambia `fecha`, `createdAt`,
-- `fechaEntrega` ni `entregadoAt` de ningún pedido).

CREATE TABLE IF NOT EXISTS "PedidoReprogramacion" (
  "id"                   TEXT NOT NULL,
  "pedidoId"             TEXT NOT NULL,
  "fechaAnterior"        TIMESTAMPTZ,
  "fechaNueva"           TIMESTAMPTZ NOT NULL,
  "motivo"               TEXT,
  "vencidaAlReprogramar" BOOLEAN NOT NULL DEFAULT false,
  "reprogramadoPorId"    TEXT NOT NULL,
  "reprogramadoAt"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "offlineId"            TEXT,
  CONSTRAINT "PedidoReprogramacion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PedidoReprogramacion_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PedidoReprogramacion_reprogramadoPorId_fkey" FOREIGN KEY ("reprogramadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PedidoReprogramacion_offlineId_key" ON "PedidoReprogramacion"("offlineId");
CREATE INDEX IF NOT EXISTS "PedidoReprogramacion_pedidoId_idx" ON "PedidoReprogramacion"("pedidoId");
CREATE INDEX IF NOT EXISTS "PedidoReprogramacion_reprogramadoPorId_idx" ON "PedidoReprogramacion"("reprogramadoPorId");
