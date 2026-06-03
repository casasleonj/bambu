-- ====================================================================
-- Bloque 5: Offline-first para Produccion
-- ====================================================================
-- Agrega Produccion.offlineId para dedup cuando la request se encola
-- offline (Dexie) y se reenvía al recuperar la red. El server detecta
-- el duplicado y devuelve la Produccion existente con deduped=true.
--
-- Patrón idéntico a Pedido.offlineId, Cliente.offlineId, Pago.offlineId.
-- Idempotente: corre seguro aunque ya esté aplicada (DO $$ guard).
-- Requiere permiso de ALTER TABLE (bambu superuser en dev).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Produccion' AND column_name = 'offlineId'
  ) THEN
    ALTER TABLE "Produccion" ADD COLUMN "offlineId" TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'Produccion_offlineId_key'
  ) THEN
    ALTER TABLE "Produccion"
      ADD CONSTRAINT "Produccion_offlineId_key"
      UNIQUE ("offlineId");
  END IF;
END $$;

-- GRANTs para que app_write/app_read puedan usar la nueva columna
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Produccion') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "Produccion" TO app_write, app_read;
  END IF;
END $$;
