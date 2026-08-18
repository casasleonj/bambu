-- FASE 1 (ADR-IDEMPOTENCIA-001, contrato §14): claves idempotentes por comando
-- reintentable offline en Pedido (entrega / anular / cancelar).
--
-- Antes: el dedup de estos comandos era por ESTADO (estadoEntrega == ENTREGADO/
-- ANULADO/CANCELADO), no por clave. Un replay con el mismo offlineId no quedaba
-- registrado bajo una clave persistida. Paridad con envioOfflineId (enviar).
--
-- Idempotente: seguro de ejecutar aunque las columnas/índices ya existan.

ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "entregaOfflineId" TEXT;
ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "anulacionOfflineId" TEXT;
ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "cancelacionOfflineId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Pedido_entregaOfflineId_key') THEN
    CREATE UNIQUE INDEX "Pedido_entregaOfflineId_key" ON "Pedido"("entregaOfflineId");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Pedido_anulacionOfflineId_key') THEN
    CREATE UNIQUE INDEX "Pedido_anulacionOfflineId_key" ON "Pedido"("anulacionOfflineId");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Pedido_cancelacionOfflineId_key') THEN
    CREATE UNIQUE INDEX "Pedido_cancelacionOfflineId_key" ON "Pedido"("cancelacionOfflineId");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Pedido_entregaOfflineId_idx" ON "Pedido"("entregaOfflineId");
CREATE INDEX IF NOT EXISTS "Pedido_anulacionOfflineId_idx" ON "Pedido"("anulacionOfflineId");
CREATE INDEX IF NOT EXISTS "Pedido_cancelacionOfflineId_idx" ON "Pedido"("cancelacionOfflineId");
