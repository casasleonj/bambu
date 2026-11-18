-- #796 / ADR-CORRECCION-MONETARIA-002 — Corregir un `Pago` que no tiene `Abono` (misma tabla, un solo mecanismo de reversión).
--
-- ADITIVA e IDEMPOTENTE, sin backfill ni reescritura de datos: agrega una columna nullable, relaja `abonoId` a nullable y
-- agrega un CHECK de «exactamente una ancla». Todas las filas existentes tienen `abonoId` y `pagoId` nulo, así que cumplen
-- el CHECK. El código anterior sigue funcionando mientras no exista ninguna fila con `abonoId` nulo; esas filas solo las crea
-- la ruta nueva `POST /api/pagos/[id]/corregir`, detrás de la bandera CORRECCION_PAGO_SIN_ABONO (apagada por defecto).
--
-- ORDEN DE DESPLIEGUE (prisma/AGENTS.md: migración exigida por el código desplegado):
--   1) ESTA migración, en producción, ANTES del merge. Es compatible con el código antiguo: este lo ignora (no lee `pagoId`) y no
--      existe ninguna fila con `abonoId` nulo mientras la bandera esté apagada. Requiere autorización explícita del PO.
--   2) Merge y despliegue del código (lectores tolerantes + ruta nueva con la bandera APAGADA). Este código SÍ lee `pagoId`
--      (Cierre, historial, integridad): sin el paso 1 esas lecturas fallarían. NO fusionar sin haber aplicado el paso 1.
--   3) Activar CORRECCION_PAGO_SIN_ABONO. Apagarla detiene nuevas correcciones por pago; las creadas quedan y son legibles.
-- Verificación de solo lectura tras el paso 1: columnas `abonoId` (nullable) y `pagoId`, restricción `chk_correccion_una_ancla`,
-- y `SELECT count(*) FROM "CorreccionAbono" WHERE "abonoId" IS NULL` = 0. Recuperación: ver REVERSA al final (ensayada).
-- NO volver a un código anterior a este cambio si ya existen filas ancladas a un pago: leía `correccion.abono.numero` sin tolerar nulos.
-- `git revert` no revierte datos.

ALTER TABLE "CorreccionAbono" ADD COLUMN IF NOT EXISTS "pagoId" TEXT;
ALTER TABLE "CorreccionAbono" ALTER COLUMN "abonoId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "CorreccionAbono_pagoId_idx" ON "CorreccionAbono"("pagoId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'CorreccionAbono_pagoId_fkey') THEN
    ALTER TABLE "CorreccionAbono"
      ADD CONSTRAINT "CorreccionAbono_pagoId_fkey"
      FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  -- Exactamente una ancla: el abono o el pago, nunca ambas ni ninguna.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_correccion_una_ancla') THEN
    ALTER TABLE "CorreccionAbono"
      ADD CONSTRAINT "chk_correccion_una_ancla" CHECK (("abonoId" IS NULL) <> ("pagoId" IS NULL));
  END IF;
END $$;

-- REVERSA (ensayada en una base desechable; solo posible mientras NO exista ninguna fila con `abonoId` nulo):
--   DELETE FROM "CorreccionAbono" WHERE "pagoId" IS NOT NULL;   -- solo si ya se decidió, con trazabilidad, retirar esas correcciones
--   ALTER TABLE "CorreccionAbono" DROP CONSTRAINT IF EXISTS "chk_correccion_una_ancla";
--   ALTER TABLE "CorreccionAbono" DROP CONSTRAINT IF EXISTS "CorreccionAbono_pagoId_fkey";
--   DROP INDEX IF EXISTS "CorreccionAbono_pagoId_idx";
--   ALTER TABLE "CorreccionAbono" DROP COLUMN "pagoId";
--   ALTER TABLE "CorreccionAbono" ALTER COLUMN "abonoId" SET NOT NULL;
-- Con correcciones ancladas a un pago la reversa se rechaza a propósito: no se pierde historia monetaria.
