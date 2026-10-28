-- #513: procedencia explícita y vínculo único entre Abono espejo y Pago.
-- Migración aditiva: conserva el origen desconocido de registros existentes.
-- No contiene backfill ni UPDATE de datos históricos.
BEGIN;

ALTER TABLE "Abono" ADD COLUMN IF NOT EXISTS "origenCobro" TEXT;
ALTER TABLE "Abono" ADD COLUMN IF NOT EXISTS "pagoOrigenId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Abono_pagoOrigenId_key" ON "Abono"("pagoOrigenId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Abono_pagoOrigenId_fkey' AND conrelid = '"Abono"'::regclass
  ) THEN
    ALTER TABLE "Abono" ADD CONSTRAINT "Abono_pagoOrigenId_fkey"
      FOREIGN KEY ("pagoOrigenId") REFERENCES "Pago"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_abono_procedencia' AND conrelid = '"Abono"'::regclass
  ) THEN
    ALTER TABLE "Abono" ADD CONSTRAINT chk_abono_procedencia CHECK (
      ("origenCobro" IS NULL AND "pagoOrigenId" IS NULL)
      OR ("origenCobro" IS NOT NULL AND "origenCobro" = 'INDEPENDIENTE' AND "pagoOrigenId" IS NULL)
      OR ("origenCobro" IS NOT NULL AND "origenCobro" = 'ESPEJO_PAGO' AND "pagoOrigenId" IS NOT NULL)
    );
  END IF;
END $$;

COMMIT;
