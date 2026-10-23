-- #401 — Una sola autoridad de numeración para Pedido.numero.
--
-- Antes: el DEFAULT de la columna usaba la secuencia del serial
-- ("Pedido_numero_seq", atrasada) y la app usaba `pedido_numero_seq`
-- (getNextNumero). Cualquier INSERT sin `numero` tomaba el DEFAULT atrasado y
-- repetía un número existente; así nacieron los repetidos que hay en producción.
--
-- Esta migración:
--   1. NO renumera ningún pedido. Los números repetidos que ya existen se
--      conservan; la fila más reciente de cada uno queda marcada con
--      "numeroColisionHistorica" = true.
--   2. Garantiza unicidad hacia adelante: índice UNIQUE parcial sobre las
--      filas no marcadas + trigger que impide marcar filas nuevas.
--   3. Deja una sola secuencia: el DEFAULT pasa a `pedido_numero_seq`, que
--      se adelanta al máximo histórico, y se elimina "Pedido_numero_seq".
--
-- Idempotente: se puede ejecutar más de una vez (CI la aplica después de
-- `prisma db push`, y producción la recibe aparte antes del merge, #359).
-- Solo agrega; el código anterior sigue funcionando con la base migrada.

-- 1. Marca de colisión histórica
ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "numeroColisionHistorica" BOOLEAN NOT NULL DEFAULT false;

-- 2. La secuencia de la app (la crea 20260817_plan_maestro_ledgers; se
--    asegura por si esta migración corre sola)
DO $$
DECLARE v_max integer;
BEGIN
  SELECT COALESCE(MAX("numero"), 0) INTO v_max FROM "Pedido";
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS pedido_numero_seq START WITH %s INCREMENT BY 1', v_max + 1);
END $$;

-- 3. Marcar las colisiones existentes: de cada número repetido se conserva
--    sin marca la fila más antigua (createdAt, id) y se marcan las demás.
UPDATE "Pedido" p
SET "numeroColisionHistorica" = true
FROM (
  SELECT id, row_number() OVER (PARTITION BY "numero" ORDER BY "createdAt", id) AS rn
  FROM "Pedido"
) r
WHERE p.id = r.id
  AND r.rn > 1
  AND NOT p."numeroColisionHistorica";

-- 4. Unicidad hacia adelante
CREATE UNIQUE INDEX IF NOT EXISTS "Pedido_numero_unico_key"
  ON "Pedido" ("numero")
  WHERE NOT "numeroColisionHistorica";

-- 5. La marca solo la pone esta migración: ni un INSERT ni un UPDATE pueden
--    marcar una fila (eso permitiría saltarse el índice del paso 4).
CREATE OR REPLACE FUNCTION pedido_proteger_colision_historica() RETURNS trigger AS $$
BEGIN
  IF NEW."numeroColisionHistorica"
     AND (TG_OP = 'INSERT' OR NOT OLD."numeroColisionHistorica") THEN
    RAISE EXCEPTION 'numeroColisionHistorica solo la asigna la migracion 20261023 (pedido %)', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Pedido_proteger_colision_historica" ON "Pedido";
CREATE TRIGGER "Pedido_proteger_colision_historica"
  BEFORE INSERT OR UPDATE ON "Pedido"
  FOR EACH ROW EXECUTE FUNCTION pedido_proteger_colision_historica();

-- 6. Una sola autoridad: adelantar `pedido_numero_seq` al máximo histórico
--    (sin retrocederla nunca), apuntar el DEFAULT a ella y borrar la vieja.
--    En una base vacía no se toca (el próximo número sigue siendo el inicial).
DO $$
DECLARE v_ultimo bigint;
BEGIN
  SELECT GREATEST(
    (SELECT COALESCE(MAX("numero"), 0) FROM "Pedido"),
    (SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM pedido_numero_seq)
  ) INTO v_ultimo;
  IF v_ultimo >= 1 THEN
    PERFORM setval('pedido_numero_seq', v_ultimo, true);
  END IF;
END $$;

ALTER TABLE "Pedido" ALTER COLUMN "numero" SET DEFAULT nextval('pedido_numero_seq');
DROP SEQUENCE IF EXISTS "Pedido_numero_seq";
ALTER SEQUENCE pedido_numero_seq OWNED BY "Pedido"."numero";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    GRANT USAGE, SELECT ON SEQUENCE pedido_numero_seq TO app_write;
  END IF;
END $$;
