-- Migration: add_pedido_excepcion_credito
-- Date: 2026-09-13
-- Purpose: F2 de Integridad Comercial (Plan Maestro §61 — Excepciones de
--   Crédito). Autorización puntual para UNA operación concreta cuando la
--   Autoridad de Crédito (F1, GetFiadoStatusUseCase) determina que el
--   cliente está en/sobre el límite de fiados. No aumenta el límite del
--   cliente, no crea un permiso permanente, no se reutiliza (pedidoId
--   pasa de null a un valor concreto UNA sola vez, atómicamente, al crear
--   el Pedido real — protegido por UNIQUE).
--
--   `User.puedeAutorizarExcepcionCredito`: capacidad explícita por usuario,
--   deliberadamente independiente de `rol` (Plan Maestro §11: "ser ADMIN
--   no debe ser la única definición conceptual de autoridad").
--
--   2 valores nuevos en NotificationEventType: reutiliza la infraestructura
--   de notificaciones ya existente (NotificationRule + notifyEvent), no se
--   crea un segundo sistema de notificaciones.
--
-- Aditiva, reversible (DROP TABLE + DROP COLUMN — los valores de enum no son
-- reversibles individualmente en Postgres, consistente con el resto del
-- schema). Idempotente. Sin backfill: entidad nueva, sin historia previa
-- que reconstruir (ADR-MIGRACION-001, "no inventar historia").

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PedidoExcepcionCreditoEstado') THEN
    CREATE TYPE "PedidoExcepcionCreditoEstado" AS ENUM ('PENDIENTE', 'AUTORIZADA', 'RECHAZADA');
  END IF;
END $$;

-- AlterEnum (Postgres soporta ADD VALUE IF NOT EXISTS de forma nativa)
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'EXCEPCION_CREDITO_SOLICITADA';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'EXCEPCION_CREDITO_RESUELTA';

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "puedeAutorizarExcepcionCredito" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PedidoExcepcionCredito" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT,
    "clienteId" TEXT NOT NULL,
    "estado" "PedidoExcepcionCreditoEstado" NOT NULL DEFAULT 'PENDIENTE',
    "motivoSolicitud" TEXT NOT NULL,
    "notaSolicitud" TEXT,
    "solicitadoPorId" TEXT NOT NULL,
    "solicitadoAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "limiteSnapshot" INTEGER NOT NULL,
    "fiadosAbiertosSnapshot" INTEGER NOT NULL,
    "saldoFiadoSnapshot" DECIMAL(10,2) NOT NULL,
    "operacionSaldoSnapshot" DECIMAL(10,2) NOT NULL,
    "fiadosDespuesSnapshot" INTEGER NOT NULL,
    "saldoDespuesSnapshot" DECIMAL(10,2) NOT NULL,
    "autorizadoPorId" TEXT,
    "autorizadoAt" TIMESTAMPTZ,
    "notaAutorizacion" TEXT,
    "rechazadoPorId" TEXT,
    "rechazadoAt" TIMESTAMPTZ,
    "notaRechazo" TEXT,
    "offlineId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "PedidoExcepcionCredito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PedidoExcepcionCredito_pedidoId_key" ON "PedidoExcepcionCredito"("pedidoId");
CREATE UNIQUE INDEX IF NOT EXISTS "PedidoExcepcionCredito_offlineId_key" ON "PedidoExcepcionCredito"("offlineId");
CREATE INDEX IF NOT EXISTS "PedidoExcepcionCredito_clienteId_idx" ON "PedidoExcepcionCredito"("clienteId");
CREATE INDEX IF NOT EXISTS "PedidoExcepcionCredito_estado_idx" ON "PedidoExcepcionCredito"("estado");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'PedidoExcepcionCredito_pedidoId_fkey') THEN
    ALTER TABLE "PedidoExcepcionCredito" ADD CONSTRAINT "PedidoExcepcionCredito_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'PedidoExcepcionCredito_clienteId_fkey') THEN
    ALTER TABLE "PedidoExcepcionCredito" ADD CONSTRAINT "PedidoExcepcionCredito_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'PedidoExcepcionCredito_solicitadoPorId_fkey') THEN
    ALTER TABLE "PedidoExcepcionCredito" ADD CONSTRAINT "PedidoExcepcionCredito_solicitadoPorId_fkey" FOREIGN KEY ("solicitadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'PedidoExcepcionCredito_autorizadoPorId_fkey') THEN
    ALTER TABLE "PedidoExcepcionCredito" ADD CONSTRAINT "PedidoExcepcionCredito_autorizadoPorId_fkey" FOREIGN KEY ("autorizadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'PedidoExcepcionCredito_rechazadoPorId_fkey') THEN
    ALTER TABLE "PedidoExcepcionCredito" ADD CONSTRAINT "PedidoExcepcionCredito_rechazadoPorId_fkey" FOREIGN KEY ("rechazadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
