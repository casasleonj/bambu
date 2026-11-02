-- #427 — Una sola autoridad de numeración para Embarque.numero (mismo patrón que #401).
--
-- Antes: la app guardaba `numero = numeroDia` (el conteo de embarques del día), así que el
-- número se repetía cada día; además el DEFAULT de la columna usaba el serial
-- "Embarque_numero_seq" y `getNextNumero` otra secuencia (`embarque_numero_seq`), ninguna usada.
--
-- Esta migración:
--   1. NO renumera ningún embarque. De cada número repetido se conserva sin marca la fila
--      más antigua y las demás quedan con "numeroColisionHistorica" = true.
--   2. Garantiza unicidad hacia adelante: índice UNIQUE parcial sobre las filas no marcadas
--      + trigger que impide marcar filas nuevas.
--   3. Deja una sola secuencia: el DEFAULT pasa a `embarque_numero_seq`, adelantada al
--      máximo histórico, y se elimina "Embarque_numero_seq".
--
-- Idempotente y solo aditiva: el código anterior sigue funcionando con la base migrada
-- (sigue escribiendo `numero` explícito; solo fallaría al repetir un número no marcado,
-- que es justo lo que se quiere impedir).

-- 1. Marca de colisión histórica
ALTER TABLE "Embarque" ADD COLUMN IF NOT EXISTS "numeroColisionHistorica" BOOLEAN NOT NULL DEFAULT false;

-- 2. La secuencia de la app (la crea 20260611_add_abono_embarque_seqs; se asegura por si
--    esta migración corre sola)
DO $$
DECLARE v_max integer;
BEGIN
  SELECT COALESCE(MAX("numero"), 0) INTO v_max FROM "Embarque";
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS embarque_numero_seq START WITH %s INCREMENT BY 1', v_max + 1);
END $$;

-- 3. Marcar las colisiones existentes
UPDATE "Embarque" e
SET "numeroColisionHistorica" = true
FROM (
  SELECT id, row_number() OVER (PARTITION BY "numero" ORDER BY "createdAt", id) AS rn
  FROM "Embarque"
) r
WHERE e.id = r.id
  AND r.rn > 1
  AND NOT e."numeroColisionHistorica";

-- 4. Unicidad hacia adelante
CREATE UNIQUE INDEX IF NOT EXISTS "Embarque_numero_unico_key"
  ON "Embarque" ("numero")
  WHERE NOT "numeroColisionHistorica";

-- 5. La marca solo la pone esta migración
CREATE OR REPLACE FUNCTION embarque_proteger_colision_historica() RETURNS trigger AS $$
BEGIN
  IF NEW."numeroColisionHistorica"
     AND (TG_OP = 'INSERT' OR NOT OLD."numeroColisionHistorica") THEN
    RAISE EXCEPTION 'numeroColisionHistorica solo la asigna la migracion 20261103 (embarque %)', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Embarque_proteger_colision_historica" ON "Embarque";
CREATE TRIGGER "Embarque_proteger_colision_historica"
  BEFORE INSERT OR UPDATE ON "Embarque"
  FOR EACH ROW EXECUTE FUNCTION embarque_proteger_colision_historica();

-- 6. Una sola autoridad: adelantar `embarque_numero_seq` al máximo histórico (sin
--    retrocederla), apuntar el DEFAULT a ella y borrar la vieja.
DO $$
DECLARE v_ultimo bigint;
BEGIN
  SELECT GREATEST(
    (SELECT COALESCE(MAX("numero"), 0) FROM "Embarque"),
    (SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM embarque_numero_seq)
  ) INTO v_ultimo;
  IF v_ultimo >= 1 THEN
    PERFORM setval('embarque_numero_seq', v_ultimo, true);
  END IF;
END $$;

ALTER TABLE "Embarque" ALTER COLUMN "numero" SET DEFAULT nextval('embarque_numero_seq');
DROP SEQUENCE IF EXISTS "Embarque_numero_seq";
ALTER SEQUENCE embarque_numero_seq OWNED BY "Embarque"."numero";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    GRANT USAGE, SELECT ON SEQUENCE embarque_numero_seq TO app_write;
  END IF;
END $$;
