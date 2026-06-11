-- Sprint 4 (C-2 Fase 1): Trigger de sincronización legacy en Embarque.
--
-- OBJETIVO: actuar como "puente" entre el código de aplicación (que ya
-- no debería escribir las 6 columnas legacy hardcoded) y la BD (que aún
-- las tiene y las consultan varios call-sites: embarque-capacidad,
-- cierre, reportes, repartidor-client).
--
-- PATRÓN: análogo a trg_sync_pedido_legacy (Sprint 3). BEFORE INSERT
-- OR UPDATE en "EmbarqueProducto" — cada vez que se inserta/actualiza/
-- borra un producto del embarque, recalcula las columnas legacy del
-- embarque padre.
--
-- CAMPOS LEGACY:
--   pacasAgua: PACA_AGUA cargadas
--   pacasHielo: PACA_HIELO cargadas
--   devueltasAgua: PACA_AGUA devueltas
--   devueltasHielo: PACA_HIELO devueltas
--   rotasAgua: PACA_AGUA rotas
--   rotasHielo: PACA_HIELO rotas
--
-- (Cambios y roturas no se trackean legacy — están en EmbarqueProducto.cambios/rotas)
--
-- BACKFILL: ejecuta el sync para todos los embarques existentes que
-- tengan productos, similar al trigger de Pedido.

CREATE OR REPLACE FUNCTION sync_embarque_legacy_columns() RETURNS TRIGGER AS $$
DECLARE
  v_embarque_id text;
  v_pacasAgua int;
  v_pacasHielo int;
  v_devueltasAgua int;
  v_devueltasHielo int;
  v_rotasAgua int;
  v_rotasHielo int;
BEGIN
  -- Determinar el embarqueId según la operación
  IF TG_OP = 'DELETE' THEN
    v_embarque_id := OLD."embarqueId";
  ELSE
    v_embarque_id := NEW."embarqueId";
  END IF;

  -- Calcular agregados desde EmbarqueProducto
  SELECT
    COALESCE(SUM(CASE WHEN producto = 'PACA_AGUA' THEN cargadas ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN producto = 'PACA_HIELO' THEN cargadas ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN producto = 'PACA_AGUA' THEN devueltas ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN producto = 'PACA_HIELO' THEN devueltas ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN producto = 'PACA_AGUA' THEN rotas ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN producto = 'PACA_HIELO' THEN rotas ELSE 0 END), 0)
  INTO
    v_pacasAgua, v_pacasHielo,
    v_devueltasAgua, v_devueltasHielo,
    v_rotasAgua, v_rotasHielo
  FROM "EmbarqueProducto"
  WHERE "embarqueId" = v_embarque_id;

  -- Actualizar el Embarque con los valores calculados
  UPDATE "Embarque"
  SET
    "pacasAgua" = v_pacasAgua,
    "pacasHielo" = v_pacasHielo,
    "devueltasAgua" = v_devueltasAgua,
    "devueltasHielo" = v_devueltasHielo,
    "rotasAgua" = v_rotasAgua,
    "rotasHielo" = v_rotasHielo
  WHERE id = v_embarque_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger AFTER INSERT/UPDATE/DELETE en EmbarqueProducto
DROP TRIGGER IF EXISTS trg_sync_embarque_legacy ON "EmbarqueProducto";
CREATE TRIGGER trg_sync_embarque_legacy
  AFTER INSERT OR UPDATE OR DELETE ON "EmbarqueProducto"
  FOR EACH ROW
  EXECUTE FUNCTION sync_embarque_legacy_columns();

-- Backfill inicial: ejecutar el sync para todos los embarques existentes
-- que tengan productos.
DO $$
DECLARE
  v_embarque_id text;
BEGIN
  FOR v_embarque_id IN
    SELECT DISTINCT e.id
    FROM "Embarque" e
    INNER JOIN "EmbarqueProducto" ep ON ep."embarqueId" = e.id
  LOOP
    -- Forzar recálculo haciendo un UPDATE dummy en uno de sus productos
    UPDATE "EmbarqueProducto"
    SET "cargadas" = "cargadas"  -- no-op, solo dispara el trigger
    WHERE id = (
      SELECT id FROM "EmbarqueProducto"
      WHERE "embarqueId" = v_embarque_id
      ORDER BY id ASC
      LIMIT 1
    );
  END LOOP;

  RAISE NOTICE 'Trigger trg_sync_embarque_legacy creado. Backfill ejecutado.';
END $$;
