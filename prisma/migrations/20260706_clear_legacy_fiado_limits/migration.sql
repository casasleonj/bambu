-- FIX: limpia valores heredados del @default(3) previo a migration 20260626
-- (que solo hizo DROP DEFAULT, no backfill de filas existentes).
-- Solo afecta filas con el valor legacy. Overrides intencionales
-- del admin (1, 2, 5, 10) se preservan.
UPDATE "Cliente"
SET "limitePedidosFiados" = NULL
WHERE "limitePedidosFiados" = 3;
