-- Aditiva: las asignaciones antiguas se conservan solo por compatibilidad.
ALTER TABLE "EntregaExigible" ADD COLUMN IF NOT EXISTS "eventoId" TEXT;
ALTER TABLE "EntregaExigible" ADD COLUMN IF NOT EXISTS "huella" TEXT;
ALTER TABLE "EntregaExigible" ADD COLUMN IF NOT EXISTS "lineas" JSONB NOT NULL DEFAULT '[]';
CREATE UNIQUE INDEX IF NOT EXISTS "EntregaExigible_pedidoId_eventoId_key" ON "EntregaExigible"("pedidoId", "eventoId");
-- Aplicar permisos en producción solamente con autorización explícita.
