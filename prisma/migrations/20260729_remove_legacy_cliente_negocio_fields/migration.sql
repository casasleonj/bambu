-- Migration: Remove legacy negocio fields from Cliente
-- Date: 2026-07-29
--
-- PRE-REQ (run first): npx tsx prisma/migrate-negocios.ts
--   Migrates Cliente.nombreNegocio -> Negocio.nombre,
--   Cliente.tipoNegocio -> Negocio.tipoNegocio,
--   Cliente.horaApertura -> Negocio.horaApertura.

-- 1. Drop GIN index on the legacy column
DROP INDEX IF EXISTS "idx_cliente_nombreNegocio_trgm";

-- 2. Recreate search_clientes() without the legacy column
CREATE OR REPLACE FUNCTION search_clientes(query text, limit_results int DEFAULT 20)
RETURNS TABLE (
  id text,
  nombre text,
  apellido text,
  telefono text,
  barrio text,
  direccion text,
  similarity_score real
) AS $$
DECLARE
  words text[];
  word text;
BEGIN
  -- Split query into words for multi-word search
  words := regexp_split_to_array(lower(trim(query)), '\s+');

  RETURN QUERY
  SELECT DISTINCT ON (c.id)
    c.id::text,
    c.nombre,
    COALESCE(c.apellido, '')::text,
    c.telefono,
    c.barrio,
    c.direccion,
    GREATEST(
      word_similarity(query, c.nombre),
      word_similarity(query, COALESCE(c.apellido, '')),
      word_similarity(query, COALESCE(c.barrio, '')),
      word_similarity(query, COALESCE(c.direccion, ''))
    ) as similarity_score
  FROM "Cliente" c
  WHERE c.activo = true
    AND (
      c.nombre <% query OR
      COALESCE(c.apellido, '') <% query OR
      COALESCE(c.barrio, '') <% query OR
      COALESCE(c.direccion, '') <% query OR
      c.nombre ILIKE '%' || query || '%' OR
      COALESCE(c.apellido, '') ILIKE '%' || query || '%' OR
      COALESCE(c.barrio, '') ILIKE '%' || query || '%' OR
      COALESCE(c.direccion, '') ILIKE '%' || query || '%'
    )
  ORDER BY c.id, similarity_score DESC
  LIMIT limit_results;
END;
$$ LANGUAGE plpgsql;

-- 3. Drop legacy columns from Cliente
ALTER TABLE "Cliente" DROP COLUMN IF EXISTS "nombreNegocio";
ALTER TABLE "Cliente" DROP COLUMN IF EXISTS "tipoNegocio";
ALTER TABLE "Cliente" DROP COLUMN IF EXISTS "horaApertura";
