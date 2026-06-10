-- Fase 3 CONTRACT: drop de columnas legacy
-- ALTER TABLE ... DROP COLUMN es operación de metadata en PG 13+, milisegundos.

ALTER TABLE "Cliente" DROP COLUMN "contactos";
ALTER TABLE "PlantillaRecurrente" DROP COLUMN "productos";
