-- Sprint 3 (C-2 Fase 1): Trigger de sincronización legacy en Pedido.
--
-- OBJETIVO: actuar como "puente" entre el código de aplicación (que
-- ya no escribe las 18 columnas legacy hardcoded) y la BD (que aún
-- las tiene y las consultan varios call-sites: nomina, reportes,
-- recomendaciones, embarque-capacidad, recurrentes).
--
-- PATRÓN: BEFORE INSERT OR UPDATE en "PedidoItem" — cada vez que se
-- inserta/actualiza un item, recalcula las columnas legacy de su
-- Pedido padre a partir del set completo de items. Esto mantiene la
-- BD sincronizada sin que el código de aplicación tenga que escribir
-- en legacy.
--
-- CÓMO FUNCIONA:
--   1. App hace INSERT INTO Pedido (sin legacy) + INSERT INTO PedidoItem
--   2. Trigger AFTER INSERT en PedidoItem → recalcula legacy del padre
--   3. UPDATE Pedido SET cPacaAguaPed = ... (calculado desde items)
--
-- IDEMPOTENTE: ejecuta en cada INSERT/UPDATE/DELETE de PedidoItem.
-- Si el código aún escribe legacy explícitamente, el trigger lo
-- SOBREESCRIBE con el valor calculado (single source of truth).
--
-- PERFORMANCE: el trigger ejecuta un SELECT + UPDATE por cada cambio
-- en PedidoItem. Con 6 usuarios y ~50 tx/día, es despreciable.
-- En Fase 3 (DROP COLUMN) se elimina este trigger.
--
-- BORRADO DE ITEMS: ON DELETE CASCADE en PedidoItem.pedidoId elimina
-- el item, y el trigger se dispara. Si se borra el último item de un
-- producto, las legacy columns de ese producto quedan en 0.

CREATE OR REPLACE FUNCTION sync_pedido_legacy_columns() RETURNS TRIGGER AS $$
DECLARE
  v_pedido_id text;
  v_cPacaAguaPed int;
  v_cPacaAguaEnt int;
  v_cPacaHieloPed int;
  v_cPacaHieloEnt int;
  v_cBotellonFabPed int;
  v_cBotellonFabEnt int;
  v_cBotellonDomPed int;
  v_cBotellonDomEnt int;
  v_cBolsaAguaPed int;
  v_cBolsaAguaEnt int;
  v_cBolsaHieloPed int;
  v_cBolsaHieloEnt int;
  v_precioPacaAgua numeric(10,2);
  v_precioPacaHielo numeric(10,2);
  v_precioBolsaAgua numeric(10,2);
  v_precioBolsaHielo numeric(10,2);
  v_precioBotellonFab numeric(10,2);
  v_precioBotellonDom numeric(10,2);
  v_canal text;
BEGIN
  -- Determinar el pedidoId según la operación
  IF TG_OP = 'DELETE' THEN
    v_pedido_id := OLD."pedidoId";
  ELSE
    v_pedido_id := NEW."pedidoId";
  END IF;

  -- Obtener el canal del pedido para el split de botellón
  SELECT canal INTO v_canal FROM "Pedido" WHERE id = v_pedido_id;
  IF v_canal IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Calcular agregados desde items
  SELECT
    COALESCE(SUM(CASE WHEN producto = 'PACA_AGUA' THEN "cantPedido" ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN producto = 'PACA_AGUA' THEN "cantEntrega" ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN producto = 'PACA_HIELO' THEN "cantPedido" ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN producto = 'PACA_HIELO' THEN "cantEntrega" ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN producto = 'BOTELLON' THEN "cantPedido" ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN producto = 'BOTELLON' THEN "cantEntrega" ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN producto = 'BOLSA_AGUA' THEN "cantPedido" ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN producto = 'BOLSA_AGUA' THEN "cantEntrega" ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN producto = 'BOLSA_HIELO' THEN "cantPedido" ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN producto = 'BOLSA_HIELO' THEN "cantEntrega" ELSE 0 END), 0),
    COALESCE(MAX(CASE WHEN producto = 'PACA_AGUA' THEN precio END), 0),
    COALESCE(MAX(CASE WHEN producto = 'PACA_HIELO' THEN precio END), 0),
    COALESCE(MAX(CASE WHEN producto = 'BOLSA_AGUA' THEN precio END), 0),
    COALESCE(MAX(CASE WHEN producto = 'BOLSA_HIELO' THEN precio END), 0),
    COALESCE(MAX(CASE WHEN producto = 'BOTELLON' THEN precio END), 0)
  INTO
    v_cPacaAguaPed, v_cPacaAguaEnt,
    v_cPacaHieloPed, v_cPacaHieloEnt,
    v_cBotellonFabPed, v_cBotellonFabEnt, -- placeholder, split abajo
    v_cBolsaAguaPed, v_cBolsaAguaEnt,
    v_cBolsaHieloPed, v_cBolsaHieloEnt,
    v_precioPacaAgua, v_precioPacaHielo,
    v_precioBolsaAgua, v_precioBolsaHielo,
    v_precioBotellonFab
  FROM "PedidoItem"
  WHERE "pedidoId" = v_pedido_id;

  -- Botellón split por canal
  IF v_canal = 'PUNTO' THEN
    v_cBotellonFabPed := v_cBotellonFabPed; -- ya calculado arriba
    v_cBotellonFabEnt := v_cBotellonFabEnt;
    v_cBotellonDomPed := 0;
    v_cBotellonDomEnt := 0;
    v_precioBotellonFab := v_precioBotellonFab;
    v_precioBotellonDom := 0;
  ELSE
    -- DOMICILIO (default)
    v_cBotellonDomPed := v_cBotellonFabPed; -- reusa el agregado total
    v_cBotellonDomEnt := v_cBotellonFabEnt;
    v_cBotellonFabPed := 0;
    v_cBotellonFabEnt := 0;
    v_precioBotellonDom := v_precioBotellonFab;
    v_precioBotellonFab := 0;
  END IF;

  -- Actualizar el Pedido con los valores calculados
  UPDATE "Pedido"
  SET
    "cPacaAguaPed" = v_cPacaAguaPed,
    "cPacaAguaEnt" = v_cPacaAguaEnt,
    "cPacaHieloPed" = v_cPacaHieloPed,
    "cPacaHieloEnt" = v_cPacaHieloEnt,
    "cBotellonFabPed" = v_cBotellonFabPed,
    "cBotellonFabEnt" = v_cBotellonFabEnt,
    "cBotellonDomPed" = v_cBotellonDomPed,
    "cBotellonDomEnt" = v_cBotellonDomEnt,
    "cBolsaAguaPed" = v_cBolsaAguaPed,
    "cBolsaAguaEnt" = v_cBolsaAguaEnt,
    "cBolsaHieloPed" = v_cBolsaHieloPed,
    "cBolsaHieloEnt" = v_cBolsaHieloEnt,
    "precioPacaAgua" = v_precioPacaAgua,
    "precioPacaHielo" = v_precioPacaHielo,
    "precioBolsaAgua" = v_precioBolsaAgua,
    "precioBolsaHielo" = v_precioBolsaHielo,
    "precioBotellonFab" = v_precioBotellonFab,
    "precioBotellonDom" = v_precioBotellonDom
  WHERE id = v_pedido_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger AFTER INSERT/UPDATE/DELETE en PedidoItem
-- AFTER (no BEFORE) para que el item ya exista cuando recalculamos.
DROP TRIGGER IF EXISTS trg_sync_pedido_legacy ON "PedidoItem";
CREATE TRIGGER trg_sync_pedido_legacy
  AFTER INSERT OR UPDATE OR DELETE ON "PedidoItem"
  FOR EACH ROW
  EXECUTE FUNCTION sync_pedido_legacy_columns();

-- Backfill inicial: ejecutar el sync para todos los pedidos existentes
-- que tengan items. Esto unifica la BD con el comportamiento del trigger.
DO $$
DECLARE
  v_pedido_id text;
BEGIN
  FOR v_pedido_id IN
    SELECT DISTINCT p.id
    FROM "Pedido" p
    INNER JOIN "PedidoItem" pi ON pi."pedidoId" = p.id
  LOOP
    -- Forzar recálculo haciendo un UPDATE dummy en uno de sus items
    -- (PostgreSQL no soporta UPDATE ... LIMIT, usamos subquery)
    UPDATE "PedidoItem"
    SET "cantPedido" = "cantPedido"  -- no-op, solo dispara el trigger
    WHERE id = (
      SELECT id FROM "PedidoItem"
      WHERE "pedidoId" = v_pedido_id
      ORDER BY id ASC
      LIMIT 1
    );
  END LOOP;

  RAISE NOTICE 'Trigger trg_sync_pedido_legacy creado. Backfill ejecutado.';
END $$;
