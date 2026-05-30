-- Migration: Add pg_trgm extension and search infrastructure
-- Date: 2026-05-30

-- 1. Enable pg_trgm extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. GIN indexes for fuzzy text search on Cliente
CREATE INDEX IF NOT EXISTS idx_cliente_nombre_trgm ON "Cliente" USING GIN (nombre gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cliente_apellido_trgm ON "Cliente" USING GIN (apellido gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cliente_barrio_trgm ON "Cliente" USING GIN (barrio gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cliente_direccion_trgm ON "Cliente" USING GIN (direccion gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cliente_nombreNegocio_trgm ON "Cliente" USING GIN ("nombreNegocio" gin_trgm_ops);

-- 3. GIN indexes for Negocio
CREATE INDEX IF NOT EXISTS idx_negocio_nombre_trgm ON "Negocio" USING GIN (nombre gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_negocio_barrio_trgm ON "Negocio" USING GIN (barrio gin_trgm_ops);

-- 4. GIN indexes for other searchable entities
CREATE INDEX IF NOT EXISTS idx_trabajador_nombre_trgm ON "Trabajador" USING GIN (nombre gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_proveedor_nombre_trgm ON "Proveedor" USING GIN (nombre gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_insumo_nombre_trgm ON "Insumo" USING GIN (nombre gin_trgm_ops);

-- 5. Unified search function for clientes with pg_trgm + word_similarity ranking
CREATE OR REPLACE FUNCTION search_clientes(query text, limit_results int DEFAULT 20)
RETURNS TABLE (
  id text,
  nombre text,
  apellido text,
  telefono text,
  barrio text,
  direccion text,
  "nombreNegocio" text,
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
    c."nombreNegocio",
    GREATEST(
      word_similarity(query, c.nombre),
      word_similarity(query, COALESCE(c.apellido, '')),
      word_similarity(query, COALESCE(c."nombreNegocio", '')),
      word_similarity(query, COALESCE(c.barrio, '')),
      word_similarity(query, COALESCE(c.direccion, ''))
    ) as similarity_score
  FROM "Cliente" c
  WHERE c.activo = true
    AND (
      -- word_similarity operator: matches any continuous extent of trigrams
      c.nombre <% query OR
      COALESCE(c.apellido, '') <% query OR
      COALESCE(c."nombreNegocio", '') <% query OR
      COALESCE(c.barrio, '') <% query OR
      COALESCE(c.direccion, '') <% query OR
      -- Also support ILIKE for prefix matching (uses trgm index)
      c.nombre ILIKE '%' || query || '%' OR
      COALESCE(c.apellido, '') ILIKE '%' || query || '%' OR
      COALESCE(c."nombreNegocio", '') ILIKE '%' || query || '%' OR
      COALESCE(c.barrio, '') ILIKE '%' || query || '%' OR
      COALESCE(c.direccion, '') ILIKE '%' || query || '%'
    )
  ORDER BY c.id, similarity_score DESC
  LIMIT limit_results;
END;
$$ LANGUAGE plpgsql;

-- 6. Search function for negocios
CREATE OR REPLACE FUNCTION search_negocios(query text, limit_results int DEFAULT 20)
RETURNS TABLE (
  id text,
  nombre text,
  "tipoNegocio" text,
  barrio text,
  direccion text,
  "clienteId" text,
  similarity_score real
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id::text,
    n.nombre,
    n."tipoNegocio",
    n.barrio,
    n.direccion,
    n."clienteId"::text,
    GREATEST(
      word_similarity(query, n.nombre),
      word_similarity(query, COALESCE(n.barrio, '')),
      word_similarity(query, COALESCE(n.direccion, ''))
    ) as similarity_score
  FROM "Negocio" n
  WHERE n.activo = true
    AND (
      n.nombre <% query OR
      COALESCE(n.barrio, '') <% query OR
      COALESCE(n.direccion, '') <% query OR
      n.nombre ILIKE '%' || query || '%' OR
      COALESCE(n.barrio, '') ILIKE '%' || query || '%' OR
      COALESCE(n.direccion, '') ILIKE '%' || query || '%'
    )
  ORDER BY similarity_score DESC
  LIMIT limit_results;
END;
$$ LANGUAGE plpgsql;

-- 7. Search function for facturas (by numero or client name)
CREATE OR REPLACE FUNCTION search_facturas(query text, limit_results int DEFAULT 20)
RETURNS TABLE (
  id text,
  numero text,
  "clienteNombre" text,
  fecha timestamp with time zone,
  similarity_score real
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id::text,
    f.numero,
    (f.nombre || ' ' || COALESCE(f.apellido, ''))::text as "clienteNombre",
    f.fecha,
    GREATEST(
      word_similarity(query, f.numero),
      word_similarity(query, f.nombre || ' ' || COALESCE(f.apellido, ''))
    ) as similarity_score
  FROM "Factura" f
  WHERE (
    f.numero <% query OR
    (f.nombre || ' ' || COALESCE(f.apellido, '')) <% query OR
    f.numero ILIKE '%' || query || '%' OR
    (f.nombre || ' ' || COALESCE(f.apellido, '')) ILIKE '%' || query || '%'
  )
  ORDER BY similarity_score DESC, f.fecha DESC
  LIMIT limit_results;
END;
$$ LANGUAGE plpgsql;
