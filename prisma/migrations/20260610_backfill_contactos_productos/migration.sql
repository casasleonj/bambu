-- Backfill idempotente y paginado.
-- Re-ejecutable: WHERE NOT EXISTS evita duplicados.
-- Paginación por id (cuid string) en lotes de 100.
--
-- IMPORTANTE (F1 — bug detectado en dry-run):
-- La condición de salida del loop debe ser ÚNICAMENTE `last_id IS NOT NULL`.
-- El patrón `inserted > 0 OR last_id IS NOT NULL` causa loop infinito cuando
-- el último batch real procesa todas sus filas y luego los siguientes loops
-- hacen 0 inserts pero `last_id` mantiene un valor no-nulo.
--
-- Validado con dry-run contra DB local: el patrón original entraba en loop
-- infinito. El patrón corregido termina en 1 iteración para 120 clientes.

-- ============================================
-- Backfill Cliente.contactos → ContactoCliente
-- ============================================
DO $$
DECLARE
  batch_size INT := 100;
  last_id   TEXT := '';
  inserted  INT := 0;
  total     INT := 0;
  iter      INT := 0;
BEGIN
  LOOP
    iter := iter + 1;
    EXIT WHEN iter > 1000;  -- safety: máximo 100k clientes procesados

    WITH batch AS (
      SELECT id FROM "Cliente"
      WHERE id > last_id
      ORDER BY id
      LIMIT batch_size
    )
    INSERT INTO "ContactoCliente" (id, "clienteId", nombre, telefono, relacion)
    SELECT
      gen_random_uuid()::text,
      c.id,
      elem->>'nombre',
      elem->>'telefono',
      elem->>'relacion'
    FROM batch b
    JOIN "Cliente" c ON c.id = b.id
    CROSS JOIN LATERAL jsonb_array_elements(c.contactos::jsonb) AS elem
    WHERE c.contactos IS NOT NULL
      AND jsonb_typeof(c.contactos::jsonb) = 'array'
      AND COALESCE(elem->>'telefono', '') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM "ContactoCliente" cc
        WHERE cc."clienteId" = c.id
          AND cc.telefono = elem->>'telefono'
          AND cc.nombre = elem->>'nombre'
      );

    GET DIAGNOSTICS inserted = ROW_COUNT;
    total := total + inserted;

    -- Tomar el último id del batch actual (no el primero del siguiente)
    SELECT id INTO last_id FROM "Cliente" WHERE id > last_id ORDER BY id LIMIT 1;
    EXIT WHEN last_id IS NULL;  -- ÚNICA condición de salida

    RAISE NOTICE 'Iter %: inserted=%, last_id=%', iter, inserted, last_id;
  END LOOP;

  RAISE NOTICE 'Backfill contactos completo: % filas insertadas (en % iters)', total, iter;
END $$;

-- ============================================
-- Backfill PlantillaRecurrente.productos → PlantillaProducto
-- ============================================
DO $$
DECLARE
  batch_size INT := 100;
  last_id   TEXT := '';
  inserted  INT := 0;
  total     INT := 0;
  iter      INT := 0;
BEGIN
  LOOP
    iter := iter + 1;
    EXIT WHEN iter > 1000;

    WITH batch AS (
      SELECT id FROM "PlantillaRecurrente"
      WHERE id > last_id
      ORDER BY id
      LIMIT batch_size
    )
    INSERT INTO "PlantillaProducto" (id, "plantillaId", producto, cantidad)
    SELECT
      gen_random_uuid()::text,
      p.id,
      kv.key,
      (kv.value)::int
    FROM batch b
    JOIN "PlantillaRecurrente" p ON p.id = b.id
    CROSS JOIN LATERAL jsonb_each_text(p.productos::jsonb) AS kv
    WHERE p.productos IS NOT NULL
      AND p.productos <> ''
      AND (kv.value)::int > 0
      AND NOT EXISTS (
        SELECT 1 FROM "PlantillaProducto" pp
        WHERE pp."plantillaId" = p.id AND pp.producto = kv.key
      );

    GET DIAGNOSTICS inserted = ROW_COUNT;
    total := total + inserted;

    SELECT id INTO last_id FROM "PlantillaRecurrente" WHERE id > last_id ORDER BY id LIMIT 1;
    EXIT WHEN last_id IS NULL;

    RAISE NOTICE 'Iter %: inserted=%, last_id=%', iter, inserted, last_id;
  END LOOP;

  RAISE NOTICE 'Backfill productos completo: % filas insertadas (en % iters)', total, iter;
END $$;
