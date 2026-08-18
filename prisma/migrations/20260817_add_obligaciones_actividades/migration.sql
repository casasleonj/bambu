-- FASE 3 (ADR-OBLIGACION-001 / ADR-ACTIVIDAD-001, contrato §7): CHECK constraints
-- y partial unique index de obligaciones/actividades.
--
-- Las tablas/enums se crean con `prisma db push`; este archivo solo añade lo
-- que Prisma no genera: CHECKs y el índice parcial "máximo una asignación
-- activa por obligación". Idempotente.

DO $$
BEGIN
  -- Invariante central (§7): cantidadCumplida + cantidadAsignada <= cantidadOriginal.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_obligacion_no_sobreconsumo'
  ) THEN
    ALTER TABLE "ObligacionPendiente"
      ADD CONSTRAINT "chk_obligacion_no_sobreconsumo" CHECK (
        "cantidadCumplida" + "cantidadAsignada" <= "cantidadOriginal"
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_obligacion_cantidades_no_negativas'
  ) THEN
    ALTER TABLE "ObligacionPendiente"
      ADD CONSTRAINT "chk_obligacion_cantidades_no_negativas" CHECK (
        "cantidadOriginal" >= 0 AND "cantidadCumplida" >= 0 AND "cantidadAsignada" >= 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_actividad_cantidad_pos'
  ) THEN
    ALTER TABLE "Actividad"
      ADD CONSTRAINT "chk_actividad_cantidad_pos" CHECK ("cantidad" > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_actividad_cumplida_no_negativa'
  ) THEN
    ALTER TABLE "Actividad"
      ADD CONSTRAINT "chk_actividad_cumplida_no_negativa" CHECK ("cantidadCumplida" >= 0);
  END IF;
END $$;

-- Contrato §1: "Debe existir como máximo una asignación activa".
-- Interpretación (ADR-ACTIVIDAD-001): una Actividad tiene un único embarqueId
-- (asignación por diseño). El constraint de DB evita DUPLICAR la asignación de
-- la misma obligación al MISMO embarque con dos actividades activas. Múltiples
-- actividades de la misma obligación en embarques DISTINTOS (o sin embarque)
-- son válidas — la sobre-asignación la previene chk_obligacion_no_sobreconsumo
-- + el lock OBLIGACION:obligacionId.
CREATE UNIQUE INDEX IF NOT EXISTS "Actividad_obligacion_embarque_activa_unique"
  ON "Actividad"("obligacionId", "embarqueId")
  WHERE "estado" IN ('ASIGNADA', 'EN_PROGRESO') AND "embarqueId" IS NOT NULL;
