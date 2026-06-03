-- ====================================================================
-- Bloque 2: Refactor Produccion → Produccion + ProduccionItem
-- ====================================================================
-- Botellones y bolsas son passthrough (sin ciclo de stock), por eso
-- ProduccionItem solo trackea PACA_AGUA y PACA_HIELO.
--
-- Esta migración es big-bang:
--   1. CREATE TABLE ProduccionItem
--   2. Backfill: 1 Produccion → 2 ProduccionItem (PACA_AGUA, PACA_HIELO)
--   3. DROP columnas per-product de Produccion
--
-- Idempotente: corre seguro aunque ya esté aplicada (todo con IF NOT EXISTS
-- y DO $$ guards).

-- ── 1. Crear tabla ProduccionItem ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "ProduccionItem" (
  "id"                TEXT PRIMARY KEY,
  "produccionId"      TEXT NOT NULL,
  "producto"          TEXT NOT NULL,
  "conteoA"           INTEGER NOT NULL DEFAULT 0,
  "conteoB"           INTEGER NOT NULL DEFAULT 0,
  "producido"         INTEGER NOT NULL DEFAULT 0,
  "stockIni"          INTEGER NOT NULL DEFAULT 0,
  "ventas"            INTEGER NOT NULL DEFAULT 0,
  "stockFinEsperado"  INTEGER NOT NULL DEFAULT 0,
  "stockFinFisico"    INTEGER NOT NULL DEFAULT 0,
  "diferencia"        INTEGER NOT NULL DEFAULT 0,
  "filtradas"         INTEGER NOT NULL DEFAULT 0,
  "rotas"             INTEGER NOT NULL DEFAULT 0,
  "consumoInterno"    INTEGER NOT NULL DEFAULT 0,
  "comSellador"       DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ProduccionItem_produccionId_fkey"
    FOREIGN KEY ("produccionId") REFERENCES "Produccion"("id") ON DELETE CASCADE
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'ProduccionItem_produccionId_producto_key'
  ) THEN
    ALTER TABLE "ProduccionItem"
      ADD CONSTRAINT "ProduccionItem_produccionId_producto_key"
      UNIQUE ("produccionId", "producto");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ProduccionItem_produccionId_idx"
  ON "ProduccionItem"("produccionId");
CREATE INDEX IF NOT EXISTS "ProduccionItem_producto_idx"
  ON "ProduccionItem"("producto");

-- ── 2. Backfill desde Produccion ────────────────────────────────────
-- Solo se hace si la tabla Produccion todavía tiene las columnas viejas
-- (es la primera corrida de la migración).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Produccion' AND column_name = 'prodAgua'
  ) THEN
    -- Item PACA_AGUA
    INSERT INTO "ProduccionItem" (
      "id", "produccionId", "producto",
      "conteoA", "conteoB", "producido",
      "stockIni", "ventas",
      "stockFinEsperado", "stockFinFisico", "diferencia",
      "filtradas", "rotas", "consumoInterno", "comSellador"
    )
    SELECT
      'pi_' || p."id" || '_agua',
      p."id",
      'PACA_AGUA',
      p."conteoAAgua", p."conteoBAgua", p."prodAgua",
      p."stockIniAgua", p."ventasAgua",
      p."stockFinAgua", p."stockFinFisicoAgua",
      p."stockFinAgua" - p."stockFinFisicoAgua"
        - p."rotasAgua" - p."filtradasAgua" - p."consumoInternoAgua",
      p."filtradasAgua", p."rotasAgua", p."consumoInternoAgua",
      p."comSelladorAgua"
    FROM "Produccion" p
    ON CONFLICT ("produccionId", "producto") DO NOTHING;

    -- Item PACA_HIELO
    INSERT INTO "ProduccionItem" (
      "id", "produccionId", "producto",
      "conteoA", "conteoB", "producido",
      "stockIni", "ventas",
      "stockFinEsperado", "stockFinFisico", "diferencia",
      "filtradas", "rotas", "consumoInterno", "comSellador"
    )
    SELECT
      'pi_' || p."id" || '_hielo',
      p."id",
      'PACA_HIELO',
      p."conteoAHielo", p."conteoBHielo", p."prodHielo",
      p."stockIniHielo", p."ventasHielo",
      p."stockFinHielo", p."stockFinFisicoHielo",
      p."stockFinHielo" - p."stockFinFisicoHielo"
        - p."rotasHielo" - p."filtradasHielo" - p."consumoInternoHielo",
      p."filtradasHielo", p."rotasHielo", p."consumoInternoHielo",
      p."comSelladorHielo"
    FROM "Produccion" p
    ON CONFLICT ("produccionId", "producto") DO NOTHING;
  END IF;
END $$;

-- ── 3. DROP columnas per-product de Produccion ─────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'stockIniAgua') THEN
    ALTER TABLE "Produccion" DROP COLUMN "stockIniAgua";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'stockIniHielo') THEN
    ALTER TABLE "Produccion" DROP COLUMN "stockIniHielo";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'conteoAAgua') THEN
    ALTER TABLE "Produccion" DROP COLUMN "conteoAAgua";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'conteoBAgua') THEN
    ALTER TABLE "Produccion" DROP COLUMN "conteoBAgua";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'conteoAHielo') THEN
    ALTER TABLE "Produccion" DROP COLUMN "conteoAHielo";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'conteoBHielo') THEN
    ALTER TABLE "Produccion" DROP COLUMN "conteoBHielo";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'prodAgua') THEN
    ALTER TABLE "Produccion" DROP COLUMN "prodAgua";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'prodHielo') THEN
    ALTER TABLE "Produccion" DROP COLUMN "prodHielo";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'ventasAgua') THEN
    ALTER TABLE "Produccion" DROP COLUMN "ventasAgua";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'ventasHielo') THEN
    ALTER TABLE "Produccion" DROP COLUMN "ventasHielo";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'stockFinAgua') THEN
    ALTER TABLE "Produccion" DROP COLUMN "stockFinAgua";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'stockFinHielo') THEN
    ALTER TABLE "Produccion" DROP COLUMN "stockFinHielo";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'stockFinFisicoAgua') THEN
    ALTER TABLE "Produccion" DROP COLUMN "stockFinFisicoAgua";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'stockFinFisicoHielo') THEN
    ALTER TABLE "Produccion" DROP COLUMN "stockFinFisicoHielo";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'filtradasAgua') THEN
    ALTER TABLE "Produccion" DROP COLUMN "filtradasAgua";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'filtradasHielo') THEN
    ALTER TABLE "Produccion" DROP COLUMN "filtradasHielo";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'rotasAgua') THEN
    ALTER TABLE "Produccion" DROP COLUMN "rotasAgua";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'rotasHielo') THEN
    ALTER TABLE "Produccion" DROP COLUMN "rotasHielo";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'consumoInternoAgua') THEN
    ALTER TABLE "Produccion" DROP COLUMN "consumoInternoAgua";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'consumoInternoHielo') THEN
    ALTER TABLE "Produccion" DROP COLUMN "consumoInternoHielo";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'comSelladorAgua') THEN
    ALTER TABLE "Produccion" DROP COLUMN "comSelladorAgua";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'comSelladorHielo') THEN
    ALTER TABLE "Produccion" DROP COLUMN "comSelladorHielo";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'comRepartidorAgua') THEN
    ALTER TABLE "Produccion" DROP COLUMN "comRepartidorAgua";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Produccion' AND column_name = 'comRepartidorHielo') THEN
    ALTER TABLE "Produccion" DROP COLUMN "comRepartidorHielo";
  END IF;
END $$;
