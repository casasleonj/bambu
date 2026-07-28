-- Add missing performance indexes identified in performance audit
-- Fase 1: Indexes for ORDER BY and sorting performance

-- Pedido: @@index([numero])
-- Covers all pedidos queries that ORDER BY numero DESC
-- Without this index, PostgreSQL does a full table scan + sort at 50K+ rows (~200-500ms)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Pedido_numero_idx" ON "Pedido" ("numero");

-- Pedido: @@index([fecha, numero]) composite
-- Covers the most common query pattern: filter by date range + ORDER BY numero
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Pedido_fecha_numero_idx" ON "Pedido" ("fecha", "numero");

-- Embarque: @@index([numero])
-- Covers embarques queries that ORDER BY numero
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Embarque_numero_idx" ON "Embarque" ("numero");

-- Cliente: @@index([nombre])
-- Covers clientes list page: orderBy: { nombre: 'asc' }
-- Without this index, every client list query does a full table scan + sort
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Cliente_nombre_idx" ON "Cliente" ("nombre");
