-- Contrato §13 / ADR-RESPONSABILIDAD-001: ResponsibilityCase debe poder
-- investigarse sin una operación (embarque) activa -- ej. fiado vencido
-- detectado días después del cierre. Agrega `clienteId` como contexto
-- alternativo nullable, aditivo, idempotente (expand-only, sin tocar datos
-- existentes).

ALTER TABLE "ResponsibilityCase" ADD COLUMN IF NOT EXISTS "clienteId" TEXT;

CREATE INDEX IF NOT EXISTS "ResponsibilityCase_clienteId_idx" ON "ResponsibilityCase"("clienteId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ResponsibilityCase_clienteId_fkey') THEN
    ALTER TABLE "ResponsibilityCase" ADD CONSTRAINT "ResponsibilityCase_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
