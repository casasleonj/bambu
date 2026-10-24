-- #402 — Pago con tres fechas (hecho, registro, regularización) y tabla
-- Regularizacion (plan de integridad v1.2 §5.D).
--
--   - Pago.createdAt   = fecha de REGISTRO (sin cambios: now(), nunca a mano).
--   - Pago.ocurridoAt  = fecha del HECHO; NULL significa "igual a createdAt".
--   - Pago.regularizacionId → Regularizacion (lote auditado: quién autorizó,
--     quién ejecutó, evidencia, hash de la simulación). Su `ejecutadoAt` es la
--     fecha de regularización.
--
-- Solo agrega (columnas NULL, tabla nueva): el código anterior sigue
-- funcionando con la base migrada. Sin backfill. Idempotente: CI la aplica
-- después de `prisma db push` y producción la recibe aparte antes del merge
-- (#359). Nombres de índices y FKs iguales a los que genera Prisma.

CREATE TABLE IF NOT EXISTS "Regularizacion" (
  "id"              TEXT NOT NULL,
  "lote"            TEXT NOT NULL,
  "motivo"          TEXT NOT NULL,
  "evidencia"       TEXT,
  "autorizadoPorId" TEXT NOT NULL,
  "ejecutadoPorId"  TEXT NOT NULL,
  "ejecutadoAt"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "simulacionHash"  TEXT,
  CONSTRAINT "Regularizacion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Regularizacion_lote_key" ON "Regularizacion"("lote");
CREATE INDEX IF NOT EXISTS "Regularizacion_autorizadoPorId_idx" ON "Regularizacion"("autorizadoPorId");
CREATE INDEX IF NOT EXISTS "Regularizacion_ejecutadoPorId_idx" ON "Regularizacion"("ejecutadoPorId");

ALTER TABLE "Pago" ADD COLUMN IF NOT EXISTS "ocurridoAt" TIMESTAMPTZ;
ALTER TABLE "Pago" ADD COLUMN IF NOT EXISTS "regularizacionId" TEXT;
CREATE INDEX IF NOT EXISTS "Pago_regularizacionId_idx" ON "Pago"("regularizacionId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Regularizacion_autorizadoPorId_fkey') THEN
    ALTER TABLE "Regularizacion"
      ADD CONSTRAINT "Regularizacion_autorizadoPorId_fkey"
      FOREIGN KEY ("autorizadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Regularizacion_ejecutadoPorId_fkey') THEN
    ALTER TABLE "Regularizacion"
      ADD CONSTRAINT "Regularizacion_ejecutadoPorId_fkey"
      FOREIGN KEY ("ejecutadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Pago_regularizacionId_fkey') THEN
    ALTER TABLE "Pago"
      ADD CONSTRAINT "Pago_regularizacionId_fkey"
      FOREIGN KEY ("regularizacionId") REFERENCES "Regularizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Una regularización describe un hecho pasado: si un pago la tiene, su fecha
-- del hecho es obligatoria y no posterior a su registro.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pago_regularizacion_ocurrido') THEN
    ALTER TABLE "Pago" ADD CONSTRAINT "chk_pago_regularizacion_ocurrido" CHECK (
      "regularizacionId" IS NULL OR ("ocurridoAt" IS NOT NULL AND "ocurridoAt" <= "createdAt")
    );
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE "Regularizacion" TO app_write;
  END IF;
END $$;
