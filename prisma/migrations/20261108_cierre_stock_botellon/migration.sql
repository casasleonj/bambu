-- #618 — Inventario de botellones llenos en el cierre del día.
--
--   CierreDia.stockIniBotellon / prodBotellon / stockFinBotellon: botellones llenos al empezar el día, llenados ese día y
--   conteo final. NULL = cierre anterior a este cambio (el stock inicial de botellones sale entonces de Config
--   STOCK_INI_BOTELLON, igual que agua y hielo cuando no hay cierre previo).
--
-- Solo agrega columnas nulables: el código anterior sigue funcionando con la base migrada.
-- Idempotente: producción la recibe aparte ANTES del merge (incidente #350).

ALTER TABLE "CierreDia" ADD COLUMN IF NOT EXISTS "stockIniBotellon" INTEGER;
ALTER TABLE "CierreDia" ADD COLUMN IF NOT EXISTS "prodBotellon" INTEGER;
ALTER TABLE "CierreDia" ADD COLUMN IF NOT EXISTS "stockFinBotellon" INTEGER;
