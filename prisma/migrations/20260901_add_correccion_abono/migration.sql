-- Migration: add_correccion_abono
-- Date: 2026-09-01
-- Purpose: ADR-CORRECCION-MONETARIA-001 D.3 — reversión append-only de un `Abono`
--   mal aplicado. NO edita ni borra el Abono original; lo compensa vía una
--   `ReceivableEntry` tipo `REVERSION` (`ReceivableEntry.tipo` es TEXT libre, no
--   requiere ALTER TYPE).
--
-- Aditiva, reversible (DROP TABLE). Idempotente. Sin backfill (las correcciones
-- son hacia adelante; los abonos históricos mal aplicados se corrigen a mano
-- vía el nuevo flujo cuando se detecten).

CREATE TABLE IF NOT EXISTS "CorreccionAbono" (
  "id"                   TEXT NOT NULL,
  "numero"               TEXT NOT NULL,
  "abonoId"              TEXT NOT NULL,
  "tipo"                 TEXT NOT NULL,
  "montoRevertido"       DECIMAL(10,2) NOT NULL,
  "motivo"               TEXT NOT NULL,
  "autorizadoPorId"      TEXT NOT NULL,
  "responsibilityCaseId" TEXT,
  "correccionOfflineId"  TEXT,
  "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CorreccionAbono_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CorreccionAbono_numero_key" ON "CorreccionAbono"("numero");
CREATE UNIQUE INDEX IF NOT EXISTS "CorreccionAbono_correccionOfflineId_key" ON "CorreccionAbono"("correccionOfflineId");
CREATE INDEX IF NOT EXISTS "CorreccionAbono_abonoId_idx" ON "CorreccionAbono"("abonoId");
CREATE INDEX IF NOT EXISTS "CorreccionAbono_responsibilityCaseId_idx" ON "CorreccionAbono"("responsibilityCaseId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'CorreccionAbono_abonoId_fkey') THEN
    ALTER TABLE "CorreccionAbono"
      ADD CONSTRAINT "CorreccionAbono_abonoId_fkey"
      FOREIGN KEY ("abonoId") REFERENCES "Abono"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'CorreccionAbono_autorizadoPorId_fkey') THEN
    ALTER TABLE "CorreccionAbono"
      ADD CONSTRAINT "CorreccionAbono_autorizadoPorId_fkey"
      FOREIGN KEY ("autorizadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'CorreccionAbono_responsibilityCaseId_fkey') THEN
    ALTER TABLE "CorreccionAbono"
      ADD CONSTRAINT "CorreccionAbono_responsibilityCaseId_fkey"
      FOREIGN KEY ("responsibilityCaseId") REFERENCES "ResponsibilityCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ADR §"Concurrencia": montoRevertido > 0 y no puede exceder el monto del abono
-- original (chk_correccion_no_excede se valida en aplicación contra abono.monto;
-- acá solo el signo, que es invariante de tabla).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_correccion_monto_pos') THEN
    ALTER TABLE "CorreccionAbono" ADD CONSTRAINT "chk_correccion_monto_pos" CHECK ("montoRevertido" > 0);
  END IF;
END $$;

-- Grants (mismo patrón que las demás migraciones que crean tablas).
-- app_write recibe UPDATE/DELETE aunque el modelo sea append-only a nivel app:
-- g2.2 setea `responsibilityCaseId` post-creación en el flujo NO_RECIBIDO.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "CorreccionAbono" TO app_write;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_read') THEN
    GRANT SELECT ON "CorreccionAbono" TO app_read;
  END IF;
END $$;
