-- Fix: search_clientes() no buscaba por teléfono ni por negocio
--
-- La refactorización 20260729_remove_legacy_cliente_negocio_fields eliminó
-- la columna legacy Cliente.nombreNegocio de la función pero no agregó la
-- tabla formal Negocio ni el teléfono del cliente. Esto rompió búsqueda por
-- celular y por nombre de tienda/negocio en el path pg_trgm.

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
      COALESCE(c.direccion, '') ILIKE '%' || query || '%' OR
      c.telefono ILIKE '%' || query || '%' OR
      EXISTS (
        SELECT 1 FROM "Negocio" n
        WHERE n."clienteId" = c.id
          AND n.activo = true
          AND (
            n.nombre ILIKE '%' || query || '%' OR
            COALESCE(n."tipoNegocio", '') ILIKE '%' || query || '%' OR
            COALESCE(n.direccion, '') ILIKE '%' || query || '%' OR
            COALESCE(n.barrio, '') ILIKE '%' || query || '%' OR
            COALESCE(n.referencia, '') ILIKE '%' || query || '%'
          )
      )
    )
  ORDER BY c.id, similarity_score DESC
  LIMIT limit_results;
END;
$$ LANGUAGE plpgsql;
