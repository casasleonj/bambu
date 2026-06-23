-- Importación histórica Fase 2:
-- 1. Proveedor.nit para deduplicación de proveedores.
-- 2. Secuencia atómica para CompraInsumo.numero (formato COMP-XXXXX).

-- ─── Proveedor.nit ────────────────────────────────────────────────────
ALTER TABLE "Proveedor" ADD COLUMN IF NOT EXISTS "nit" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Proveedor_nit_key" ON "Proveedor"("nit");

-- ─── CompraInsumo.numero sequence ─────────────────────────────────────
DO $$
DECLARE
  v_max_compra_num integer;
BEGIN
  SELECT COALESCE(
    MAX(
      CAST(
        SUBSTRING("numero" FROM 'COMP-0*(\d+)') AS integer
      )
    ),
    0
  ) INTO v_max_compra_num
  FROM "CompraInsumo"
  WHERE "numero" ~ '^COMP-[0-9]+$';

  EXECUTE format(
    'CREATE SEQUENCE IF NOT EXISTS compra_insumo_numero_seq START WITH %s INCREMENT BY 1',
    v_max_compra_num + 1
  );

  EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE compra_insumo_numero_seq TO app_write';

  RAISE NOTICE 'Secuencia compra_insumo_numero_seq creada con START WITH %', v_max_compra_num + 1;
END $$;

-- ─── Grants ───────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON "Proveedor" TO app_write;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Insumo" TO app_write;
GRANT SELECT, INSERT, UPDATE, DELETE ON "CompraInsumo" TO app_write;
