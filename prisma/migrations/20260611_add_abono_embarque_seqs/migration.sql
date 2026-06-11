-- Sprint 1+6 §C-4: secuencias Postgres atómicas para Abono.numero y
-- Embarque.numero. Reemplazan el patrón "aggregate MAX + 1" que NO es
-- atómico fuera de un advisory lock y que puede generar números
-- duplicados si dos transacciones con locks distintos lo invocan.
--
-- nextval() es atómico a nivel de Postgres: dos llamadas concurrentes
-- retornan valores distintos. La unique constraint en Abono.numero y
-- Embarque.numero (o @@unique compuesto en embarque_trabajador_fecha
-- _numeroDia) sigue siendo la red de seguridad final.
--
-- Misma estrategia que 20260610_add_factura_numero_seq:
--   - START WITH = MAX(correlativo extraído) + 1
--   - GRANT USAGE + SELECT al rol app_write
--
-- Diferencia: Abono.numero es TEXT con formato "ABO-XXXXX" y
-- Embarque.numero es INT autoincrement. La extracción difiere.

DO $$
DECLARE
  v_max_abono_num integer;
  v_max_embarque_num integer;
BEGIN
  -- ─── Abono.numero (formato "ABO-XXXXX") ──────────────────────────────
  SELECT COALESCE(
    MAX(
      CAST(
        SUBSTRING("numero" FROM 'ABO-0*(\d+)') AS integer
      )
    ),
    0
  ) INTO v_max_abono_num
  FROM "Abono"
  WHERE "numero" ~ '^ABO-[0-9]+$';

  EXECUTE format(
    'CREATE SEQUENCE IF NOT EXISTS abono_numero_seq START WITH %s INCREMENT BY 1',
    v_max_abono_num + 1
  );

  EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE abono_numero_seq TO app_write';

  RAISE NOTICE 'Secuencia abono_numero_seq creada con START WITH %', v_max_abono_num + 1;

  -- ─── Embarque.numero (INT) ───────────────────────────────────────────
  SELECT COALESCE(MAX("numero"), 0) INTO v_max_embarque_num
  FROM "Embarque";

  EXECUTE format(
    'CREATE SEQUENCE IF NOT EXISTS embarque_numero_seq START WITH %s INCREMENT BY 1',
    v_max_embarque_num + 1
  );

  EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE embarque_numero_seq TO app_write';

  RAISE NOTICE 'Secuencia embarque_numero_seq creada con START WITH %', v_max_embarque_num + 1;
END $$;
