-- Add trabajadorId to Gasto for linking historical worker payments

ALTER TABLE "Gasto"
  ADD COLUMN IF NOT EXISTS "trabajadorId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Gasto_trabajadorId_fkey'
      AND conrelid = '"Gasto"'::regclass
  ) THEN
    ALTER TABLE "Gasto"
      ADD CONSTRAINT "Gasto_trabajadorId_fkey"
      FOREIGN KEY ("trabajadorId")
      REFERENCES "Trabajador"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Gasto_trabajadorId_idx" ON "Gasto"("trabajadorId");
