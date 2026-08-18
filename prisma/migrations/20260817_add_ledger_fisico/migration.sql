-- FASE 2 (ADR-FISICO-001, contrato §8): CHECK constraints del ledger físico.
--
-- Prisma Schema Language NO soporta CHECK constraints, así que viven en SQL
-- raw (mismo patrón que 20260610_add_check_constraints). Las tablas/enums del
-- ledger físico se crean con `prisma db push`; este archivo solo añade los
-- CHECKs que Prisma no genera.
--
-- Idempotente: cada constraint se añade solo si no existe.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_embarque_movimiento_cantidad_pos'
  ) THEN
    ALTER TABLE "EmbarqueMovimiento"
      ADD CONSTRAINT "chk_embarque_movimiento_cantidad_pos" CHECK ("cantidad" > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_embarque_carga_producto_cantidad_pos'
  ) THEN
    ALTER TABLE "EmbarqueCargaProducto"
      ADD CONSTRAINT "chk_embarque_carga_producto_cantidad_pos" CHECK ("cantidad" > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_retorno_cantidad_pos'
  ) THEN
    ALTER TABLE "Retorno"
      ADD CONSTRAINT "chk_retorno_cantidad_pos" CHECK ("cantidad" > 0);
  END IF;

  -- Contrato §8: AJUSTE_AUTORIZADO exige authorization != NULL, userId != NULL
  -- y metadata.effect válido (INCREASE | DECREASE).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_embarque_movimiento_ajuste_autorizado'
  ) THEN
    ALTER TABLE "EmbarqueMovimiento"
      ADD CONSTRAINT "chk_embarque_movimiento_ajuste_autorizado" CHECK (
        "tipo" <> 'AJUSTE_AUTORIZADO'
        OR (
          "authorization" IS NOT NULL
          AND "userId" IS NOT NULL
          AND "metadata"->>'effect' IN ('INCREASE', 'DECREASE')
        )
      );
  END IF;
END $$;
