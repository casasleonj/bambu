-- #560 — Devolución del saldo a favor al cliente (egreso de caja con autorización).
-- ADITIVA e IDEMPOTENTE: solo crea una tabla nueva; el código anterior no la conoce, así que se puede
-- aplicar en producción ANTES del despliegue. No toca ningún dato existente.

CREATE TABLE IF NOT EXISTS "DevolucionSaldoFavor" (
  "id"              TEXT NOT NULL,
  "clienteId"       TEXT NOT NULL,
  "metodo"          "MetodoPago" NOT NULL,
  "monto"           DECIMAL(10,2) NOT NULL,
  "motivo"          TEXT NOT NULL,
  "offlineId"       TEXT NOT NULL,
  "autorizadoPorId" TEXT NOT NULL,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DevolucionSaldoFavor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DevolucionSaldoFavor_offlineId_key" ON "DevolucionSaldoFavor"("offlineId");
CREATE INDEX IF NOT EXISTS "DevolucionSaldoFavor_clienteId_idx" ON "DevolucionSaldoFavor"("clienteId");
CREATE INDEX IF NOT EXISTS "DevolucionSaldoFavor_createdAt_idx" ON "DevolucionSaldoFavor"("createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DevolucionSaldoFavor_clienteId_fkey') THEN
    ALTER TABLE "DevolucionSaldoFavor"
      ADD CONSTRAINT "DevolucionSaldoFavor_clienteId_fkey"
      FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- El importe siempre es positivo y BONO nunca se devuelve en dinero.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_devolucion_saldo_favor_monto') THEN
    ALTER TABLE "DevolucionSaldoFavor" ADD CONSTRAINT "chk_devolucion_saldo_favor_monto"
      CHECK ("monto" > 0 AND "metodo" <> 'BONO');
  END IF;
END $$;

-- Append-only: sin UPDATE ni DELETE.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    GRANT SELECT, INSERT ON TABLE "DevolucionSaldoFavor" TO app_write;
  END IF;
END $$;
