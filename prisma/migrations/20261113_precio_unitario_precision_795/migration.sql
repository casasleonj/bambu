-- #795. Expansión de escala sin perder los ocho dígitos enteros anteriores.
-- Repetible; no recalcula pedidos, pagos, facturas ni cierres históricos.
-- Aplicar con autorización previa al despliegue que use precios precisos.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "Pedido"
  ALTER COLUMN "precioPacaAgua" TYPE NUMERIC(14,6),
  ALTER COLUMN "precioPacaHielo" TYPE NUMERIC(14,6),
  ALTER COLUMN "precioBotellonFab" TYPE NUMERIC(14,6),
  ALTER COLUMN "precioBotellonDom" TYPE NUMERIC(14,6),
  ALTER COLUMN "precioBolsaAgua" TYPE NUMERIC(14,6),
  ALTER COLUMN "precioBolsaHielo" TYPE NUMERIC(14,6);
ALTER TABLE "PedidoItem" ALTER COLUMN "precio" TYPE NUMERIC(14,6);
ALTER TABLE "PedidoCorreccionPrecio"
  ALTER COLUMN "precioAnterior" TYPE NUMERIC(14,6),
  ALTER COLUMN "precioNuevo" TYPE NUMERIC(14,6);
ALTER TABLE "PedidoReduccionComercial" ALTER COLUMN "precio" TYPE NUMERIC(14,6);
COMMIT;
