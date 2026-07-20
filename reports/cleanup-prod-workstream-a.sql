-- cleanup-prod-workstream-a.sql
-- Script para eliminar datos de prueba generados durante el QA Paranoido
-- Workstream A en producción.
--
-- ADVERTENCIA: Revisar los WHERE antes de ejecutar. Este script asume que los
-- datos de prueba se identifican por:
--   - clientes.nombre contiene 'Test', 'QA', 'E2E' o teléfono empieza con '999'
--   - pedidos creados por el usuario de QA con observación marcada
-- Ajustar según el log real del walkthrough.

BEGIN;

-- 1. Identificar clientes de prueba
WITH clientes_test AS (
  SELECT id
  FROM "Cliente"
  WHERE nombre ILIKE '%Test%'
     OR nombre ILIKE '%QA%'
     OR nombre ILIKE '%E2E%'
     OR telefono LIKE '999%'
),
-- 2. Pedidos de esos clientes (incluye ventas anónimas ligadas a QA)
pedidos_test AS (
  SELECT p.id
  FROM "Pedido" p
  JOIN clientes_test c ON p."clienteId" = c.id
)
-- 3. Borrar dependencias antes que los padres
DELETE FROM "Pago" WHERE "pedidoId" IN (SELECT id FROM pedidos_test);
DELETE FROM "PedidoItem" WHERE "pedidoId" IN (SELECT id FROM pedidos_test);
DELETE FROM "NotaCredito" WHERE "pedidoId" IN (SELECT id FROM pedidos_test);
DELETE FROM "Factura" WHERE "pedidoId" IN (SELECT id FROM pedidos_test);
DELETE FROM "Pedido" WHERE id IN (SELECT id FROM pedidos_test);

-- 4. Borrar embarques de prueba (si se crearon con trabajador/obs de QA)
WITH embarques_test AS (
  SELECT e.id
  FROM "Embarque" e
  WHERE e.obs ILIKE '%test%'
     OR e.obs ILIKE '%qa%'
     OR e."numeroDia" > 10000  -- placeholder: ajustar según rango real
)
DELETE FROM "EmbarqueProducto" WHERE "embarqueId" IN (SELECT id FROM embarques_test);
UPDATE "Pedido" SET "embarqueId" = NULL WHERE "embarqueId" IN (SELECT id FROM embarques_test);
DELETE FROM "Embarque" WHERE id IN (SELECT id FROM embarques_test);

-- 5. Borrar clientes de prueba
DELETE FROM "ContactoCliente" WHERE "clienteId" IN (SELECT id FROM clientes_test);
DELETE FROM "Cliente" WHERE id IN (SELECT id FROM clientes_test);

COMMIT;
