-- Add offlineId fields for offline-resilience dedup (Phase 1-4)
-- These fields enable the offline-first pattern: client generates a UUID,
-- server persists it, retries with same UUID return the existing record.
-- Idempotent: safe to run even if columns/indexes already exist.

-- AlterTable (idempotent with IF NOT EXISTS)
ALTER TABLE "Pago" ADD COLUMN IF NOT EXISTS "offlineId" TEXT;
CREATE INDEX IF NOT EXISTS "Pago_offlineId_idx" ON "Pago"("offlineId");

ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "recurrenteBatchId" TEXT;
CREATE INDEX IF NOT EXISTS "Pedido_recurrenteBatchId_idx" ON "Pedido"("recurrenteBatchId");

ALTER TABLE "Embarque" ADD COLUMN IF NOT EXISTS "offlineId" TEXT;
CREATE INDEX IF NOT EXISTS "Embarque_offlineId_idx" ON "Embarque"("offlineId");

ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "offlineId" TEXT;
-- Cliente.offlineId is @unique in schema (one offlineId = one client)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Cliente_offlineId_key') THEN
    CREATE UNIQUE INDEX "Cliente_offlineId_key" ON "Cliente"("offlineId");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "Cliente_offlineId_idx" ON "Cliente"("offlineId");
