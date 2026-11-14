-- #617 — Corrección administrativa de la fecha efectiva de un pago, con rastro append-only.
-- ADITIVA e IDEMPOTENTE: solo crea una tabla nueva; el código anterior no la conoce ni la necesita,
-- así que se puede aplicar en producción ANTES del despliegue. No toca ningún dato existente
-- (no cambia `Pago.createdAt` ni `Pago.ocurridoAt` de ningún pago ya registrado).

CREATE TABLE IF NOT EXISTS "PagoFechaCorreccion" (
  "id"             TEXT NOT NULL,
  "pagoId"         TEXT NOT NULL,
  "fechaAnterior"  TIMESTAMPTZ NOT NULL,
  "fechaNueva"     TIMESTAMPTZ NOT NULL,
  "motivo"         TEXT NOT NULL,
  "corregidoPorId" TEXT NOT NULL,
  "corregidoAt"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "offlineId"      TEXT,
  CONSTRAINT "PagoFechaCorreccion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PagoFechaCorreccion_offlineId_key" ON "PagoFechaCorreccion"("offlineId");
CREATE INDEX IF NOT EXISTS "PagoFechaCorreccion_pagoId_idx" ON "PagoFechaCorreccion"("pagoId");
CREATE INDEX IF NOT EXISTS "PagoFechaCorreccion_corregidoPorId_idx" ON "PagoFechaCorreccion"("corregidoPorId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PagoFechaCorreccion_pagoId_fkey') THEN
    ALTER TABLE "PagoFechaCorreccion"
      ADD CONSTRAINT "PagoFechaCorreccion_pagoId_fkey"
      FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PagoFechaCorreccion_corregidoPorId_fkey') THEN
    ALTER TABLE "PagoFechaCorreccion"
      ADD CONSTRAINT "PagoFechaCorreccion_corregidoPorId_fkey"
      FOREIGN KEY ("corregidoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Una corrección siempre cambia la fecha y siempre trae un motivo.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pago_fecha_correccion') THEN
    ALTER TABLE "PagoFechaCorreccion" ADD CONSTRAINT "chk_pago_fecha_correccion"
      CHECK ("fechaAnterior" <> "fechaNueva" AND length(btrim("motivo")) >= 3);
  END IF;
END $$;

-- Append-only: sin UPDATE ni DELETE.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    GRANT SELECT, INSERT ON TABLE "PagoFechaCorreccion" TO app_write;
  END IF;
END $$;
