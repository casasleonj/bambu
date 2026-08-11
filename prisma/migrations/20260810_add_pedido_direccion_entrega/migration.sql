-- Dirección de entrega puntual por pedido (snapshot, no toca Cliente/Negocio).
-- Nullable, sin default, aditiva: cero riesgo para filas existentes — null
-- significa "sin override, usar la dirección resuelta en vivo (negocio gana,
-- fallback cliente)" via pickDireccionTexto().
-- Idempotente: seguro correr aunque las columnas ya existan.
--
-- No hace falta GRANT nuevo: el GRANT de tabla ya cubre columnas agregadas
-- después (verificado por precedente exacto en
-- 20260602_add_offline_id_fields, que agregó Pedido.recurrenteBatchId sin
-- re-otorgar permisos).
-- No hace falta índice: estas columnas nunca se filtran/buscan, solo se
-- leen por fila.

ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "direccionEntrega" TEXT;
ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "barrioEntrega" TEXT;
