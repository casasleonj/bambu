-- Issue #992 (F0): compatibilidad Prisma <-> PostgreSQL para plan de deuda.
-- Aditiva, idempotente, transaccional y compatible con versiones anteriores.
-- NO cambia importes, deducciones, saldos, nóminas ni fechas de pagos.
--
-- Un único DO garantiza rollback completo si una pre/postcondición falla.
-- lock_timeout evita quedar esperando indefinidamente un bloqueo de tabla.
DO $migration$
DECLARE
  columnas_incompatibles TEXT;
  columnas_compatibles INTEGER;
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);

  -- IF NOT EXISTS por sí solo no valida los atributos de columnas existentes.
  SELECT string_agg(column_name, ', ' ORDER BY column_name)
    INTO columnas_incompatibles
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'DeudaTrabajador'
     AND column_name IN ('plazoNominas', 'porcentajePorNomina')
     AND (
       data_type IS DISTINCT FROM 'integer'
       OR is_nullable IS DISTINCT FROM 'YES'
       OR column_default IS NOT NULL
     );

  IF columnas_incompatibles IS NOT NULL THEN
    RAISE EXCEPTION 'Issue #992: columnas existentes incompatibles en DeudaTrabajador: %',
      columnas_incompatibles;
  END IF;

  ALTER TABLE public."DeudaTrabajador"
    ADD COLUMN IF NOT EXISTS "plazoNominas" INTEGER,
    ADD COLUMN IF NOT EXISTS "porcentajePorNomina" INTEGER;

  SELECT count(*)
    INTO columnas_compatibles
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'DeudaTrabajador'
     AND column_name IN ('plazoNominas', 'porcentajePorNomina')
     AND data_type = 'integer'
     AND is_nullable = 'YES'
     AND column_default IS NULL;

  IF columnas_compatibles <> 2 THEN
    RAISE EXCEPTION 'Issue #992: verificación posterior de DeudaTrabajador fallida: %/2 columnas compatibles',
      columnas_compatibles;
  END IF;
END
$migration$;
