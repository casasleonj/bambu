-- #524 — Ingreso a la caja del sobrante de un cobro de fiados acreditado a saldo a favor.
-- ADITIVA e IDEMPOTENTE: solo crea una tabla nueva; el código anterior no la conoce ni la necesita,
-- así que se puede aplicar en producción ANTES del despliegue. No toca ningún dato existente
-- (en producción no hay cobros con sobrante: no hay nada que reconstruir).

CREATE TABLE IF NOT EXISTS "IngresoSaldoFavor" (
  "id"          TEXT NOT NULL,
  "clienteId"   TEXT NOT NULL,
  "metodo"      "MetodoPago" NOT NULL,
  "monto"       DECIMAL(10,2) NOT NULL,
  "origen"      TEXT NOT NULL,
  "offlineId"   TEXT,
  "auditoriaId" TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IngresoSaldoFavor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IngresoSaldoFavor_origen_offlineId_metodo_key"
  ON "IngresoSaldoFavor"("origen", "offlineId", "metodo");
CREATE INDEX IF NOT EXISTS "IngresoSaldoFavor_clienteId_idx" ON "IngresoSaldoFavor"("clienteId");
CREATE INDEX IF NOT EXISTS "IngresoSaldoFavor_createdAt_idx" ON "IngresoSaldoFavor"("createdAt");
CREATE INDEX IF NOT EXISTS "IngresoSaldoFavor_auditoriaId_idx" ON "IngresoSaldoFavor"("auditoriaId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IngresoSaldoFavor_clienteId_fkey') THEN
    ALTER TABLE "IngresoSaldoFavor"
      ADD CONSTRAINT "IngresoSaldoFavor_clienteId_fkey"
      FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- El importe siempre es positivo y BONO nunca es un ingreso (consume crédito, no entra dinero).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ingreso_saldo_favor_monto') THEN
    ALTER TABLE "IngresoSaldoFavor" ADD CONSTRAINT "chk_ingreso_saldo_favor_monto"
      CHECK ("monto" > 0 AND "metodo" <> 'BONO');
  END IF;
END $$;

-- Append-only: sin UPDATE ni DELETE.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    GRANT SELECT, INSERT ON TABLE "IngresoSaldoFavor" TO app_write;
  END IF;
END $$;
