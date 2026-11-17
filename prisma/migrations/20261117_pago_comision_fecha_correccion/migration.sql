-- #834 — Corrección administrativa (solo ADMIN) del día real de caja de un pago de comisión, con rastro append-only.
-- ADITIVA e IDEMPOTENTE: solo crea una tabla nueva; el código anterior no la conoce ni la necesita, así que se puede aplicar en
-- producción ANTES del despliegue. No toca ningún dato existente (no cambia `createdAt`, `fecha` ni `fechaPagoReal` de ningún pago).

CREATE TABLE IF NOT EXISTS "PagoComisionFechaCorreccion" (
  "id"                TEXT NOT NULL,
  "pagoId"            TEXT NOT NULL,
  "fechaRealAnterior" TIMESTAMPTZ,
  "fechaRealNueva"    TIMESTAMPTZ NOT NULL,
  "motivo"            TEXT NOT NULL,
  "corregidoPorId"    TEXT NOT NULL,
  "corregidoAt"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "offlineId"         TEXT,
  CONSTRAINT "PagoComisionFechaCorreccion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PagoComisionFechaCorreccion_offlineId_key" ON "PagoComisionFechaCorreccion"("offlineId");
CREATE INDEX IF NOT EXISTS "PagoComisionFechaCorreccion_pagoId_idx" ON "PagoComisionFechaCorreccion"("pagoId");
CREATE INDEX IF NOT EXISTS "PagoComisionFechaCorreccion_corregidoPorId_idx" ON "PagoComisionFechaCorreccion"("corregidoPorId");
CREATE INDEX IF NOT EXISTS "PagoComisionFechaCorreccion_corregidoAt_idx" ON "PagoComisionFechaCorreccion"("corregidoAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PagoComisionFechaCorreccion_pagoId_fkey') THEN
    ALTER TABLE "PagoComisionFechaCorreccion"
      ADD CONSTRAINT "PagoComisionFechaCorreccion_pagoId_fkey"
      FOREIGN KEY ("pagoId") REFERENCES "PagoComisionRepartidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PagoComisionFechaCorreccion_corregidoPorId_fkey') THEN
    ALTER TABLE "PagoComisionFechaCorreccion"
      ADD CONSTRAINT "PagoComisionFechaCorreccion_corregidoPorId_fkey"
      FOREIGN KEY ("corregidoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Una corrección siempre cambia el día real y siempre trae un motivo.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pago_comision_fecha_correccion') THEN
    ALTER TABLE "PagoComisionFechaCorreccion" ADD CONSTRAINT "chk_pago_comision_fecha_correccion"
      CHECK ("fechaRealAnterior" IS DISTINCT FROM "fechaRealNueva" AND length(btrim("motivo")) >= 3);
  END IF;
END $$;

-- Append-only: sin UPDATE ni DELETE.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    GRANT SELECT, INSERT ON TABLE "PagoComisionFechaCorreccion" TO app_write;
  END IF;
END $$;
