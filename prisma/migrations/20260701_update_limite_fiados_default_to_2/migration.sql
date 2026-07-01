-- Update the global fiado limit default from 3 to 2.
-- This migration updates the row in Config for installations that
-- have it set to '3'. Idempotent: only updates if the current value
-- is exactly '3'. If the admin has already customized this value,
-- the migration skips it (preserves customizations).
UPDATE "Config"
SET "valor" = '2'
WHERE "clave" = 'LIMITE_PEDIDOS_FIADOS_DEFAULT'
  AND "valor" = '3';
