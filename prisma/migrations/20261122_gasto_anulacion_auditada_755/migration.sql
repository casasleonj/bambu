-- #755: fase aditiva. No se reescriben ni eliminan gastos históricos.
-- Requiere deploy de migración ANTES del código que lee estos campos.
ALTER TABLE "Gasto"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "anuladoAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "montoAntesAnular" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "motivoAnulacion" VARCHAR(500);
