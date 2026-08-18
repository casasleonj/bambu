-- FASE 4 (ADR-RECUPERACION-001, contrato §3/§4): CHECK constraints de RecoveryDecision.
-- Las tablas se crean con `prisma db push`; este archivo añade los CHECKs que
-- Prisma no genera. Idempotente.

DO $$
BEGIN
  -- Invariante central (§3): 0 <= cantidadAplicada <= cantidad.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_recovery_cantidad_aplicada'
  ) THEN
    ALTER TABLE "RecoveryDecision"
      ADD CONSTRAINT "chk_recovery_cantidad_aplicada" CHECK (
        "cantidadAplicada" >= 0 AND "cantidadAplicada" <= "cantidad"
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_recovery_cantidad_pos'
  ) THEN
    ALTER TABLE "RecoveryDecision"
      ADD CONSTRAINT "chk_recovery_cantidad_pos" CHECK ("cantidad" > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_recovery_tipo'
  ) THEN
    ALTER TABLE "RecoveryDecision"
      ADD CONSTRAINT "chk_recovery_tipo" CHECK ("tipo" IN ('SOBRANTE', 'FALTANTE'));
  END IF;
END $$;
