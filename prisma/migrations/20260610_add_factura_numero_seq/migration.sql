-- FIX Fase 3 §2.3: secuencia Postgres para Factura.numero.
--
-- ESTADO: MIGRACIÓN PREPARADA PERO NO APLICADA (gated por respuesta DIAN).
-- Si la DIAN acepta huecos en la numeración (estándar industria), aplicar:
--   psql -f prisma/migrations/20260610_add_factura_numero_seq/migration.sql
-- Si exige consecutivo sin huecos, NO aplicar — usar row-lock con
-- SELECT ... FOR UPDATE en su lugar.
--
-- Auditoría pre-aplicación (2026-06-10): MAX(numero) = FAC-00012.
-- La secuencia arrancará en 13 (siguiente correlativo).
--
-- Estrategia: START WITH = MAX+1 para que las facturas nuevas arranquen
-- desde el siguiente correlativo sin colisionar con las existentes.
-- El campo `numero` es TEXT con formato "FAC-XXXXX", pero la secuencia
-- produce enteros y el código formatea al insertar.

DO $$
DECLARE
  v_max_num integer;
BEGIN
  -- Extraer el mayor entero del formato "FAC-XXXXX"
  SELECT COALESCE(
    MAX(
      CAST(
        SUBSTRING("numero" FROM 'FAC-0*(\d+)') AS integer
      )
    ),
    0
  ) INTO v_max_num
  FROM "Factura"
  WHERE "numero" ~ '^FAC-[0-9]+$';

  -- Crear la secuencia si no existe
  EXECUTE format(
    'CREATE SEQUENCE IF NOT EXISTS factura_numero_seq START WITH %s INCREMENT BY 1',
    v_max_num + 1
  );

  -- IMPORTANTE: el usuario de runtime (app_write) no es owner de la
  -- secuencia. Hay que darle USAGE + SELECT explícitamente. Sin esto,
  -- nextval() falla con "permission denied for sequence".
  EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE factura_numero_seq TO app_write';

  RAISE NOTICE 'Secuencia factura_numero_seq creada/verificada con START WITH %, grants OK', v_max_num + 1;
END $$;
