-- FIX C-FIADOS-1: remove the DB default on Cliente.limitePedidosFiados
-- so that null means "use global config LIMITE_PEDIDOS_FIADOS_DEFAULT".
-- Existing rows keep their current value (3 for clients created before this
-- migration); new rows will default to null unless explicitly set.
ALTER TABLE "Cliente" ALTER COLUMN "limitePedidosFiados" DROP DEFAULT;
