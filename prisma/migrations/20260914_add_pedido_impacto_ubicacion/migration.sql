-- Migration: add_pedido_impacto_ubicacion
-- Date: 2026-09-14
-- Purpose: F3 de Integridad Comercial (Plan Maestro §61 — Dirección y
--   demanda, bullet "impacto en demanda"). Señal informativa, no
--   bloqueante: cuando cambia direccion/barrio de un Cliente/Negocio y
--   existen Pedidos pendientes (estadoEntrega PENDIENTE/EN_RUTA) sin
--   snapshot propio (direccionEntrega/barrioEntrega null — todavía
--   dependen de la resolución en vivo contra el dato maestro), se
--   registra una fila por Pedido afectado. Nunca muta el Pedido, nunca lo
--   cancela, nunca crea otro, nunca toca el planificador. Deliberadamente
--   sin pedidoId único: cada cambio real es su propio hecho auditable, no
--   se deduplica ni se pisa (Plan Maestro §63, "hechos históricos
--   conservados").
--
--   1 valor nuevo en NotificationEventType: reutiliza la infraestructura
--   de notificaciones ya existente (NotificationRule + notifyEvent).
--
-- Aditiva, reversible (DROP TABLE — el valor de enum no es reversible
-- individualmente en Postgres, consistente con el resto del schema).
-- Idempotente. Sin backfill: entidad nueva, sin historia previa que
-- reconstruir (ADR-MIGRACION-001, "no inventar historia").

-- AlterEnum (Postgres soporta ADD VALUE IF NOT EXISTS de forma nativa)
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'PEDIDO_UBICACION_DESACTUALIZADA';

-- CreateTable
CREATE TABLE IF NOT EXISTS "PedidoImpactoUbicacion" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "origenTipo" TEXT NOT NULL,
    "origenId" TEXT NOT NULL,
    "direccionAnterior" TEXT,
    "barrioAnterior" TEXT,
    "direccionNueva" TEXT,
    "barrioNueva" TEXT,
    "detectadoAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revisadoPorId" TEXT,
    "revisadoAt" TIMESTAMPTZ,
    "notaRevision" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "PedidoImpactoUbicacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PedidoImpactoUbicacion_pedidoId_idx" ON "PedidoImpactoUbicacion"("pedidoId");
CREATE INDEX IF NOT EXISTS "PedidoImpactoUbicacion_revisadoAt_idx" ON "PedidoImpactoUbicacion"("revisadoAt");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'PedidoImpactoUbicacion_pedidoId_fkey') THEN
    ALTER TABLE "PedidoImpactoUbicacion" ADD CONSTRAINT "PedidoImpactoUbicacion_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'PedidoImpactoUbicacion_revisadoPorId_fkey') THEN
    ALTER TABLE "PedidoImpactoUbicacion" ADD CONSTRAINT "PedidoImpactoUbicacion_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
