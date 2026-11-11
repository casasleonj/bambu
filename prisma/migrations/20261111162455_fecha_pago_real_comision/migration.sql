-- #673: expansión compatible con la aplicación anterior. No interpreta ni mueve pagos históricos.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."PagoComisionRepartidor"
  ADD COLUMN IF NOT EXISTS "fechaPagoReal" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "PagoComisionRepartidor_fechaPagoReal_idx"
  ON public."PagoComisionRepartidor" ("fechaPagoReal");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PagoComisionRepartidor_fechaPagoReal_dia_check'
      AND conrelid = 'public."PagoComisionRepartidor"'::regclass
  ) THEN
    ALTER TABLE public."PagoComisionRepartidor"
      ADD CONSTRAINT "PagoComisionRepartidor_fechaPagoReal_dia_check"
      CHECK ("fechaPagoReal" IS NULL OR "fechaPagoReal" =
        (date_trunc('day', "fechaPagoReal" AT TIME ZONE 'America/Bogota') AT TIME ZONE 'America/Bogota'));
  END IF;
END $$;

COMMIT;
