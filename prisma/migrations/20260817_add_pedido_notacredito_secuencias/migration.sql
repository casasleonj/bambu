-- FASE 8 (ADR-CONCURRENCIA-001, contrato §6 "Generación de secuencia"):
-- migrar Pedido.numero y NotaCredito.numero de MAX+1 (no atómico, exigía locks
-- globales SECUENCIA:pedido / SECUENCIA:notaCredito) a secuencias PG atómicas.
--
-- Con nextval() atómico, la numeración es segura sin serialización global. Los
-- locks globales quedan como sobre-serialización inofensiva (se refinan en un
-- ADR futuro). Idempotente.

-- 1. Pedido.numero (Int, serial subyacente por @default(autoincrement())).
CREATE SEQUENCE IF NOT EXISTS "pedido_numero_seq";
SELECT setval('pedido_numero_seq',
  (SELECT COALESCE(MAX("numero"), 0) + 1 FROM "Pedido"), false);

-- Sincronizar el serial subyacente para que, si algún flujo inserta sin numero
-- explícito, no colisione con los valores que entrega pedido_numero_seq.
SELECT setval(pg_get_serial_sequence('"Pedido"', 'numero'),
  (SELECT COALESCE(MAX("numero"), 0) FROM "Pedido"), true);

-- 2. NotaCredito.numero (String "NC-#####"; se extrae la parte numérica).
CREATE SEQUENCE IF NOT EXISTS "nota_credito_numero_seq";
SELECT setval('nota_credito_numero_seq',
  (SELECT COALESCE(MAX(CAST(substring("numero" FROM '[0-9]+') AS INTEGER)), 0) + 1
     FROM "NotaCredito"), false);
