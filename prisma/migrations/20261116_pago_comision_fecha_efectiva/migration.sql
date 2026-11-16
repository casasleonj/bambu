-- #673 punto 2 — fecha EFECTIVA de caja de los pagos de comisión, con rastro append-only de sus correcciones.
-- ADITIVA e IDEMPOTENTE: agrega una columna NULLABLE y una tabla nueva. El código anterior no las conoce ni las necesita
-- (NULL = «igual a createdAt», el comportamiento de siempre), así que se puede aplicar en producción ANTES del despliegue.
-- No toca ningún dato existente: no cambia `createdAt`, `fecha`, montos ni métodos de ningún pago ya registrado.

ALTER TABLE "PagoComisionRepartidor" ADD COLUMN IF NOT EXISTS "pagadoAt" TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS "PagoComisionRepartidor_pagadoAt_idx" ON "PagoComisionRepartidor"("pagadoAt");

CREATE TABLE IF NOT EXISTS "PagoComisionFechaCorreccion" (
  "id"             TEXT NOT NULL,
  "pagoId"         TEXT NOT NULL,
  "fechaAnterior"  TIMESTAMPTZ NOT NULL,
  "fechaNueva"     TIMESTAMPTZ NOT NULL,
  "motivo"         TEXT NOT NULL,
  "corregidoPorId" TEXT NOT NULL,
  "corregidoAt"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "offlineId"      TEXT,
  CONSTRAINT "PagoComisionFechaCorreccion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PagoComisionFechaCorreccion_offlineId_key" ON "PagoComisionFechaCorreccion"("offlineId");
CREATE INDEX IF NOT EXISTS "PagoComisionFechaCorreccion_pagoId_idx" ON "PagoComisionFechaCorreccion"("pagoId");
CREATE INDEX IF NOT EXISTS "PagoComisionFechaCorreccion_corregidoPorId_idx" ON "PagoComisionFechaCorreccion"("corregidoPorId");

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

-- Una corrección siempre cambia la fecha y siempre trae un motivo.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pago_comision_fecha_correccion') THEN
    ALTER TABLE "PagoComisionFechaCorreccion" ADD CONSTRAINT "chk_pago_comision_fecha_correccion"
      CHECK ("fechaAnterior" <> "fechaNueva" AND length(btrim("motivo")) >= 3);
  END IF;
END $$;

-- Append-only: sin UPDATE ni DELETE. La columna nueva de PagoComisionRepartidor hereda los permisos de la tabla.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    GRANT SELECT, INSERT ON TABLE "PagoComisionFechaCorreccion" TO app_write;
  END IF;
END $$;
