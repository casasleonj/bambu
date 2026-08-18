-- Plan maestro de evolución — ledger físico, obligaciones, recovery, cartera,
-- responsabilidad, promociones y offline (FASES 1–8 + FINAL).
--
-- Migración CONSOLIDADA, completa e idempotente: crea los enums, tablas,
-- columnas, índices, FKs, CHECK constraints y secuencias introducidos por el
-- plan maestro. Reemplaza las 5 migraciones parciales previas (20260817_*).
--
-- Idempotente: segura de ejecutar aunque las tablas ya existan (dev via
-- `db push`, prod via `db push` + este SQL). Sigue el patrón del repo:
--   - CREATE TYPE/TABLE/INDEX ... IF NOT EXISTS (o DO $$ IF NOT EXISTS).
--   - GRANT a app_write condicional (si el rol existe; en Supabase el owner es
--     postgres y no requiere GRANT).

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AvailabilityBasis') THEN
    CREATE TYPE "AvailabilityBasis" AS ENUM ('CONFIRMED_STOCK', 'PRODUCTION_CONFIRMED', 'ESTIMATED', 'MIXED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoMovimiento') THEN
    CREATE TYPE "TipoMovimiento" AS ENUM ('CARGA', 'RECARGA', 'ENTREGA', 'VENTA_RUTA', 'RETORNO', 'REEMPAQUE', 'DESCARTE', 'CUSTODY_TRANSFER', 'PROMOCION', 'AJUSTE_AUTORIZADO');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ObligacionEstado') THEN
    CREATE TYPE "ObligacionEstado" AS ENUM ('ABIERTA', 'CUMPLIDA', 'ANULADA');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ActividadTipo') THEN
    CREATE TYPE "ActividadTipo" AS ENUM ('ENTREGA', 'RECOGIDA_BOTELLON', 'COBRO');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ActividadEstado') THEN
    CREATE TYPE "ActividadEstado" AS ENUM ('ASIGNADA', 'EN_PROGRESO', 'CUMPLIDA', 'CANCELADA');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ResponsibilityEstado') THEN
    CREATE TYPE "ResponsibilityEstado" AS ENUM ('ABIERTA', 'EN_INVESTIGACION', 'RESUELTA_SIN_CARGO', 'RESUELTA_CON_CARGO', 'CERRADA');
  END IF;
END $$;

-- ============================================================
-- COLUMNAS NUEVAS (Pedido, GpsTrack)
-- ============================================================

ALTER TABLE "Pedido"
  ADD COLUMN IF NOT EXISTS "anulacionOfflineId" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelacionOfflineId" TEXT,
  ADD COLUMN IF NOT EXISTS "capturedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "clasificacionTemporal" TEXT,
  ADD COLUMN IF NOT EXISTS "entregaOfflineId" TEXT,
  ADD COLUMN IF NOT EXISTS "occurredAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "serverReceivedAt" TIMESTAMPTZ;

ALTER TABLE "GpsTrack" ADD COLUMN IF NOT EXISTS "offlineId" TEXT;

-- ============================================================
-- TABLAS
-- ============================================================

CREATE TABLE IF NOT EXISTS "EmbarqueCarga" (
    "id" TEXT NOT NULL,
    "embarqueId" TEXT NOT NULL,
    "vehiculo" TEXT,
    "capacidadKg" INTEGER,
    "availabilityBasis" "AvailabilityBasis" NOT NULL DEFAULT 'ESTIMATED',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offlineId" TEXT,
    CONSTRAINT "EmbarqueCarga_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmbarqueCargaProducto" (
    "id" TEXT NOT NULL,
    "cargaId" TEXT NOT NULL,
    "producto" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    CONSTRAINT "EmbarqueCargaProducto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmbarqueMovimiento" (
    "id" TEXT NOT NULL,
    "embarqueId" TEXT NOT NULL,
    "cargaId" TEXT,
    "tipo" "TipoMovimiento" NOT NULL,
    "producto" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "origen" TEXT,
    "destino" TEXT,
    "metadata" JSONB,
    "authorization" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offlineId" TEXT,
    CONSTRAINT "EmbarqueMovimiento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Sustitucion" (
    "id" TEXT NOT NULL,
    "embarqueId" TEXT NOT NULL,
    "pedidoId" TEXT,
    "movimientoRecepcionId" TEXT NOT NULL,
    "movimientoEntregaId" TEXT NOT NULL,
    "autorizadoPorId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offlineId" TEXT,
    CONSTRAINT "Sustitucion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Retorno" (
    "id" TEXT NOT NULL,
    "embarqueId" TEXT NOT NULL,
    "pedidoId" TEXT,
    "producto" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "motivo" TEXT,
    "movimientoId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offlineId" TEXT,
    CONSTRAINT "Retorno_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ObligacionPendiente" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT,
    "clienteId" TEXT,
    "producto" TEXT NOT NULL,
    "cantidadOriginal" INTEGER NOT NULL,
    "cantidadCumplida" INTEGER NOT NULL DEFAULT 0,
    "cantidadAsignada" INTEGER NOT NULL DEFAULT 0,
    "estado" "ObligacionEstado" NOT NULL DEFAULT 'ABIERTA',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "offlineId" TEXT,
    CONSTRAINT "ObligacionPendiente_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Actividad" (
    "id" TEXT NOT NULL,
    "obligacionId" TEXT NOT NULL,
    "embarqueId" TEXT,
    "tipo" "ActividadTipo" NOT NULL DEFAULT 'ENTREGA',
    "cantidad" INTEGER NOT NULL,
    "cantidadCumplida" INTEGER NOT NULL DEFAULT 0,
    "estado" "ActividadEstado" NOT NULL DEFAULT 'ASIGNADA',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "offlineId" TEXT,
    CONSTRAINT "Actividad_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PedidoCantidadAjuste" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "obligacionId" TEXT,
    "producto" TEXT NOT NULL,
    "cantidadOriginal" INTEGER NOT NULL,
    "cantidadNueva" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "autorizadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offlineId" TEXT,
    CONSTRAINT "PedidoCantidadAjuste_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RecoveryDecision" (
    "id" TEXT NOT NULL,
    "embarqueId" TEXT NOT NULL,
    "sourceEventId" TEXT,
    "cantidadDisponibleEnOrigen" INTEGER,
    "cantidad" INTEGER NOT NULL,
    "cantidadAplicada" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "producto" TEXT NOT NULL,
    "pedidoOrigenId" TEXT,
    "pedidoDestinoId" TEXT,
    "resultado" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "authorizedById" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offlineId" TEXT,
    CONSTRAINT "RecoveryDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReceivableEntry" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT,
    "facturaId" TEXT,
    "clienteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "saldoResultante" DECIMAL(10,2) NOT NULL,
    "totalPagadoResultante" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offlineId" TEXT,
    CONSTRAINT "ReceivableEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ResponsibilityCase" (
    "id" TEXT NOT NULL,
    "embarqueId" TEXT,
    "trabajadorId" TEXT,
    "tipo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "montoEstimado" DECIMAL(10,2),
    "estado" "ResponsibilityEstado" NOT NULL DEFAULT 'ABIERTA',
    "autorizadoPorId" TEXT,
    "resueltoPorId" TEXT,
    "resueltoAt" TIMESTAMPTZ,
    "hechoEconomicoId" TEXT,
    "hechoEconomicoTipo" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "offlineId" TEXT,
    CONSTRAINT "ResponsibilityCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PromotionRule" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "producto" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "autorizadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offlineId" TEXT,
    CONSTRAINT "PromotionRule_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS "EmbarqueCarga_offlineId_key" ON "EmbarqueCarga"("offlineId");
CREATE INDEX IF NOT EXISTS "EmbarqueCarga_embarqueId_idx" ON "EmbarqueCarga"("embarqueId");
CREATE INDEX IF NOT EXISTS "EmbarqueCarga_createdAt_idx" ON "EmbarqueCarga"("createdAt");
CREATE INDEX IF NOT EXISTS "EmbarqueCargaProducto_cargaId_idx" ON "EmbarqueCargaProducto"("cargaId");
CREATE UNIQUE INDEX IF NOT EXISTS "EmbarqueCargaProducto_cargaId_producto_key" ON "EmbarqueCargaProducto"("cargaId", "producto");
CREATE UNIQUE INDEX IF NOT EXISTS "EmbarqueMovimiento_offlineId_key" ON "EmbarqueMovimiento"("offlineId");
CREATE INDEX IF NOT EXISTS "EmbarqueMovimiento_embarqueId_idx" ON "EmbarqueMovimiento"("embarqueId");
CREATE INDEX IF NOT EXISTS "EmbarqueMovimiento_cargaId_idx" ON "EmbarqueMovimiento"("cargaId");
CREATE INDEX IF NOT EXISTS "EmbarqueMovimiento_tipo_idx" ON "EmbarqueMovimiento"("tipo");
CREATE INDEX IF NOT EXISTS "EmbarqueMovimiento_origen_idx" ON "EmbarqueMovimiento"("origen");
CREATE INDEX IF NOT EXISTS "EmbarqueMovimiento_destino_idx" ON "EmbarqueMovimiento"("destino");
CREATE INDEX IF NOT EXISTS "EmbarqueMovimiento_createdAt_idx" ON "EmbarqueMovimiento"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Sustitucion_offlineId_key" ON "Sustitucion"("offlineId");
CREATE INDEX IF NOT EXISTS "Sustitucion_embarqueId_idx" ON "Sustitucion"("embarqueId");
CREATE INDEX IF NOT EXISTS "Sustitucion_pedidoId_idx" ON "Sustitucion"("pedidoId");
CREATE UNIQUE INDEX IF NOT EXISTS "Retorno_offlineId_key" ON "Retorno"("offlineId");
CREATE INDEX IF NOT EXISTS "Retorno_embarqueId_idx" ON "Retorno"("embarqueId");
CREATE INDEX IF NOT EXISTS "Retorno_pedidoId_idx" ON "Retorno"("pedidoId");
CREATE UNIQUE INDEX IF NOT EXISTS "ObligacionPendiente_pedidoId_key" ON "ObligacionPendiente"("pedidoId");
CREATE UNIQUE INDEX IF NOT EXISTS "ObligacionPendiente_offlineId_key" ON "ObligacionPendiente"("offlineId");
CREATE INDEX IF NOT EXISTS "ObligacionPendiente_pedidoId_idx" ON "ObligacionPendiente"("pedidoId");
CREATE INDEX IF NOT EXISTS "ObligacionPendiente_clienteId_idx" ON "ObligacionPendiente"("clienteId");
CREATE INDEX IF NOT EXISTS "ObligacionPendiente_producto_idx" ON "ObligacionPendiente"("producto");
CREATE UNIQUE INDEX IF NOT EXISTS "Actividad_offlineId_key" ON "Actividad"("offlineId");
CREATE INDEX IF NOT EXISTS "Actividad_obligacionId_idx" ON "Actividad"("obligacionId");
CREATE INDEX IF NOT EXISTS "Actividad_embarqueId_idx" ON "Actividad"("embarqueId");
CREATE UNIQUE INDEX IF NOT EXISTS "PedidoCantidadAjuste_offlineId_key" ON "PedidoCantidadAjuste"("offlineId");
CREATE INDEX IF NOT EXISTS "PedidoCantidadAjuste_pedidoId_idx" ON "PedidoCantidadAjuste"("pedidoId");
CREATE INDEX IF NOT EXISTS "PedidoCantidadAjuste_obligacionId_idx" ON "PedidoCantidadAjuste"("obligacionId");
CREATE UNIQUE INDEX IF NOT EXISTS "RecoveryDecision_offlineId_key" ON "RecoveryDecision"("offlineId");
CREATE INDEX IF NOT EXISTS "RecoveryDecision_embarqueId_idx" ON "RecoveryDecision"("embarqueId");
CREATE INDEX IF NOT EXISTS "RecoveryDecision_sourceEventId_idx" ON "RecoveryDecision"("sourceEventId");
CREATE INDEX IF NOT EXISTS "RecoveryDecision_pedidoDestinoId_idx" ON "RecoveryDecision"("pedidoDestinoId");
CREATE INDEX IF NOT EXISTS "RecoveryDecision_resultado_idx" ON "RecoveryDecision"("resultado");
CREATE UNIQUE INDEX IF NOT EXISTS "ReceivableEntry_offlineId_key" ON "ReceivableEntry"("offlineId");
CREATE INDEX IF NOT EXISTS "ReceivableEntry_pedidoId_idx" ON "ReceivableEntry"("pedidoId");
CREATE INDEX IF NOT EXISTS "ReceivableEntry_clienteId_idx" ON "ReceivableEntry"("clienteId");
CREATE INDEX IF NOT EXISTS "ReceivableEntry_facturaId_idx" ON "ReceivableEntry"("facturaId");
CREATE UNIQUE INDEX IF NOT EXISTS "ResponsibilityCase_offlineId_key" ON "ResponsibilityCase"("offlineId");
CREATE INDEX IF NOT EXISTS "ResponsibilityCase_embarqueId_idx" ON "ResponsibilityCase"("embarqueId");
CREATE INDEX IF NOT EXISTS "ResponsibilityCase_trabajadorId_idx" ON "ResponsibilityCase"("trabajadorId");
CREATE INDEX IF NOT EXISTS "ResponsibilityCase_estado_idx" ON "ResponsibilityCase"("estado");
CREATE UNIQUE INDEX IF NOT EXISTS "PromotionRule_offlineId_key" ON "PromotionRule"("offlineId");
CREATE INDEX IF NOT EXISTS "PromotionRule_producto_idx" ON "PromotionRule"("producto");
CREATE INDEX IF NOT EXISTS "PromotionRule_activo_idx" ON "PromotionRule"("activo");
CREATE UNIQUE INDEX IF NOT EXISTS "Pedido_entregaOfflineId_key" ON "Pedido"("entregaOfflineId");
CREATE UNIQUE INDEX IF NOT EXISTS "Pedido_anulacionOfflineId_key" ON "Pedido"("anulacionOfflineId");
CREATE UNIQUE INDEX IF NOT EXISTS "Pedido_cancelacionOfflineId_key" ON "Pedido"("cancelacionOfflineId");
CREATE INDEX IF NOT EXISTS "Pedido_entregaOfflineId_idx" ON "Pedido"("entregaOfflineId");
CREATE INDEX IF NOT EXISTS "Pedido_anulacionOfflineId_idx" ON "Pedido"("anulacionOfflineId");
CREATE INDEX IF NOT EXISTS "Pedido_cancelacionOfflineId_idx" ON "Pedido"("cancelacionOfflineId");
CREATE UNIQUE INDEX IF NOT EXISTS "GpsTrack_offlineId_key" ON "GpsTrack"("offlineId");

-- Índice parcial "máximo una asignación activa" (contrato §1, ADR-ACTIVIDAD-001).
CREATE UNIQUE INDEX IF NOT EXISTS "Actividad_obligacion_embarque_activa_unique"
  ON "Actividad"("obligacionId", "embarqueId")
  WHERE "estado" IN ('ASIGNADA', 'EN_PROGRESO') AND "embarqueId" IS NOT NULL;

-- ============================================================
-- FOREIGN KEYS
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmbarqueCarga_embarqueId_fkey') THEN
    ALTER TABLE "EmbarqueCarga" ADD CONSTRAINT "EmbarqueCarga_embarqueId_fkey" FOREIGN KEY ("embarqueId") REFERENCES "Embarque"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmbarqueCargaProducto_cargaId_fkey') THEN
    ALTER TABLE "EmbarqueCargaProducto" ADD CONSTRAINT "EmbarqueCargaProducto_cargaId_fkey" FOREIGN KEY ("cargaId") REFERENCES "EmbarqueCarga"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmbarqueMovimiento_embarqueId_fkey') THEN
    ALTER TABLE "EmbarqueMovimiento" ADD CONSTRAINT "EmbarqueMovimiento_embarqueId_fkey" FOREIGN KEY ("embarqueId") REFERENCES "Embarque"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmbarqueMovimiento_cargaId_fkey') THEN
    ALTER TABLE "EmbarqueMovimiento" ADD CONSTRAINT "EmbarqueMovimiento_cargaId_fkey" FOREIGN KEY ("cargaId") REFERENCES "EmbarqueCarga"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmbarqueMovimiento_userId_fkey') THEN
    ALTER TABLE "EmbarqueMovimiento" ADD CONSTRAINT "EmbarqueMovimiento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Sustitucion_embarqueId_fkey') THEN
    ALTER TABLE "Sustitucion" ADD CONSTRAINT "Sustitucion_embarqueId_fkey" FOREIGN KEY ("embarqueId") REFERENCES "Embarque"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Sustitucion_pedidoId_fkey') THEN
    ALTER TABLE "Sustitucion" ADD CONSTRAINT "Sustitucion_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Sustitucion_movimientoRecepcionId_fkey') THEN
    ALTER TABLE "Sustitucion" ADD CONSTRAINT "Sustitucion_movimientoRecepcionId_fkey" FOREIGN KEY ("movimientoRecepcionId") REFERENCES "EmbarqueMovimiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Sustitucion_movimientoEntregaId_fkey') THEN
    ALTER TABLE "Sustitucion" ADD CONSTRAINT "Sustitucion_movimientoEntregaId_fkey" FOREIGN KEY ("movimientoEntregaId") REFERENCES "EmbarqueMovimiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Sustitucion_autorizadoPorId_fkey') THEN
    ALTER TABLE "Sustitucion" ADD CONSTRAINT "Sustitucion_autorizadoPorId_fkey" FOREIGN KEY ("autorizadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Retorno_embarqueId_fkey') THEN
    ALTER TABLE "Retorno" ADD CONSTRAINT "Retorno_embarqueId_fkey" FOREIGN KEY ("embarqueId") REFERENCES "Embarque"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Retorno_pedidoId_fkey') THEN
    ALTER TABLE "Retorno" ADD CONSTRAINT "Retorno_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Retorno_movimientoId_fkey') THEN
    ALTER TABLE "Retorno" ADD CONSTRAINT "Retorno_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "EmbarqueMovimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ObligacionPendiente_pedidoId_fkey') THEN
    ALTER TABLE "ObligacionPendiente" ADD CONSTRAINT "ObligacionPendiente_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ObligacionPendiente_clienteId_fkey') THEN
    ALTER TABLE "ObligacionPendiente" ADD CONSTRAINT "ObligacionPendiente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Actividad_obligacionId_fkey') THEN
    ALTER TABLE "Actividad" ADD CONSTRAINT "Actividad_obligacionId_fkey" FOREIGN KEY ("obligacionId") REFERENCES "ObligacionPendiente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Actividad_embarqueId_fkey') THEN
    ALTER TABLE "Actividad" ADD CONSTRAINT "Actividad_embarqueId_fkey" FOREIGN KEY ("embarqueId") REFERENCES "Embarque"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PedidoCantidadAjuste_pedidoId_fkey') THEN
    ALTER TABLE "PedidoCantidadAjuste" ADD CONSTRAINT "PedidoCantidadAjuste_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PedidoCantidadAjuste_obligacionId_fkey') THEN
    ALTER TABLE "PedidoCantidadAjuste" ADD CONSTRAINT "PedidoCantidadAjuste_obligacionId_fkey" FOREIGN KEY ("obligacionId") REFERENCES "ObligacionPendiente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PedidoCantidadAjuste_autorizadoPorId_fkey') THEN
    ALTER TABLE "PedidoCantidadAjuste" ADD CONSTRAINT "PedidoCantidadAjuste_autorizadoPorId_fkey" FOREIGN KEY ("autorizadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecoveryDecision_embarqueId_fkey') THEN
    ALTER TABLE "RecoveryDecision" ADD CONSTRAINT "RecoveryDecision_embarqueId_fkey" FOREIGN KEY ("embarqueId") REFERENCES "Embarque"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecoveryDecision_sourceEventId_fkey') THEN
    ALTER TABLE "RecoveryDecision" ADD CONSTRAINT "RecoveryDecision_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "EmbarqueMovimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecoveryDecision_pedidoOrigenId_fkey') THEN
    ALTER TABLE "RecoveryDecision" ADD CONSTRAINT "RecoveryDecision_pedidoOrigenId_fkey" FOREIGN KEY ("pedidoOrigenId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecoveryDecision_pedidoDestinoId_fkey') THEN
    ALTER TABLE "RecoveryDecision" ADD CONSTRAINT "RecoveryDecision_pedidoDestinoId_fkey" FOREIGN KEY ("pedidoDestinoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReceivableEntry_pedidoId_fkey') THEN
    ALTER TABLE "ReceivableEntry" ADD CONSTRAINT "ReceivableEntry_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReceivableEntry_facturaId_fkey') THEN
    ALTER TABLE "ReceivableEntry" ADD CONSTRAINT "ReceivableEntry_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReceivableEntry_clienteId_fkey') THEN
    ALTER TABLE "ReceivableEntry" ADD CONSTRAINT "ReceivableEntry_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ResponsibilityCase_embarqueId_fkey') THEN
    ALTER TABLE "ResponsibilityCase" ADD CONSTRAINT "ResponsibilityCase_embarqueId_fkey" FOREIGN KEY ("embarqueId") REFERENCES "Embarque"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ResponsibilityCase_trabajadorId_fkey') THEN
    ALTER TABLE "ResponsibilityCase" ADD CONSTRAINT "ResponsibilityCase_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ResponsibilityCase_autorizadoPorId_fkey') THEN
    ALTER TABLE "ResponsibilityCase" ADD CONSTRAINT "ResponsibilityCase_autorizadoPorId_fkey" FOREIGN KEY ("autorizadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ResponsibilityCase_resueltoPorId_fkey') THEN
    ALTER TABLE "ResponsibilityCase" ADD CONSTRAINT "ResponsibilityCase_resueltoPorId_fkey" FOREIGN KEY ("resueltoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PromotionRule_autorizadoPorId_fkey') THEN
    ALTER TABLE "PromotionRule" ADD CONSTRAINT "PromotionRule_autorizadoPorId_fkey" FOREIGN KEY ("autorizadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================================
-- CHECK CONSTRAINTS (contrato §3/§7/§8)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_embarque_movimiento_cantidad_pos') THEN
    ALTER TABLE "EmbarqueMovimiento" ADD CONSTRAINT "chk_embarque_movimiento_cantidad_pos" CHECK ("cantidad" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_embarque_carga_producto_cantidad_pos') THEN
    ALTER TABLE "EmbarqueCargaProducto" ADD CONSTRAINT "chk_embarque_carga_producto_cantidad_pos" CHECK ("cantidad" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_retorno_cantidad_pos') THEN
    ALTER TABLE "Retorno" ADD CONSTRAINT "chk_retorno_cantidad_pos" CHECK ("cantidad" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_embarque_movimiento_ajuste_autorizado') THEN
    ALTER TABLE "EmbarqueMovimiento" ADD CONSTRAINT "chk_embarque_movimiento_ajuste_autorizado" CHECK (
      "tipo" <> 'AJUSTE_AUTORIZADO'
      OR ("authorization" IS NOT NULL AND "userId" IS NOT NULL AND "metadata"->>'effect' IN ('INCREASE', 'DECREASE'))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_obligacion_no_sobreconsumo') THEN
    ALTER TABLE "ObligacionPendiente" ADD CONSTRAINT "chk_obligacion_no_sobreconsumo" CHECK (
      "cantidadCumplida" + "cantidadAsignada" <= "cantidadOriginal"
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_obligacion_cantidades_no_negativas') THEN
    ALTER TABLE "ObligacionPendiente" ADD CONSTRAINT "chk_obligacion_cantidades_no_negativas" CHECK (
      "cantidadOriginal" >= 0 AND "cantidadCumplida" >= 0 AND "cantidadAsignada" >= 0
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_actividad_cantidad_pos') THEN
    ALTER TABLE "Actividad" ADD CONSTRAINT "chk_actividad_cantidad_pos" CHECK ("cantidad" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_actividad_cumplida_no_negativa') THEN
    ALTER TABLE "Actividad" ADD CONSTRAINT "chk_actividad_cumplida_no_negativa" CHECK ("cantidadCumplida" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_recovery_cantidad_aplicada') THEN
    ALTER TABLE "RecoveryDecision" ADD CONSTRAINT "chk_recovery_cantidad_aplicada" CHECK (
      "cantidadAplicada" >= 0 AND "cantidadAplicada" <= "cantidad"
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_recovery_cantidad_pos') THEN
    ALTER TABLE "RecoveryDecision" ADD CONSTRAINT "chk_recovery_cantidad_pos" CHECK ("cantidad" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_recovery_tipo') THEN
    ALTER TABLE "RecoveryDecision" ADD CONSTRAINT "chk_recovery_tipo" CHECK ("tipo" IN ('SOBRANTE', 'FALTANTE'));
  END IF;
END $$;

-- ============================================================
-- SECUENCIAS (Pedido.numero, NotaCredito.numero → atómica)
-- ============================================================

DO $$
DECLARE v_max integer;
BEGIN
  SELECT COALESCE(MAX("numero"), 0) INTO v_max FROM "Pedido";
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS pedido_numero_seq START WITH %s INCREMENT BY 1', v_max + 1);
  -- Sincronizar el serial subyacente (autoincrement) para que un INSERT sin
  -- numero explícito no colisione con los valores de la secuencia. Solo si hay
  -- datos (setval(0) está fuera del rango del serial, que empieza en 1).
  IF v_max > 0 THEN
    PERFORM setval(pg_get_serial_sequence('"Pedido"', 'numero'), v_max, true);
  END IF;

  SELECT COALESCE(MAX(CAST(substring("numero" FROM '[0-9]+') AS INTEGER)), 0) INTO v_max FROM "NotaCredito";
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS nota_credito_numero_seq START WITH %s INCREMENT BY 1', v_max + 1);
END $$;

-- ============================================================
-- GRANTS al usuario de runtime (app_write), condicional si el rol existe
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    GRANT ALL PRIVILEGES ON TABLE "EmbarqueCarga" TO app_write;
    GRANT ALL PRIVILEGES ON TABLE "EmbarqueCargaProducto" TO app_write;
    GRANT ALL PRIVILEGES ON TABLE "EmbarqueMovimiento" TO app_write;
    GRANT ALL PRIVILEGES ON TABLE "Sustitucion" TO app_write;
    GRANT ALL PRIVILEGES ON TABLE "Retorno" TO app_write;
    GRANT ALL PRIVILEGES ON TABLE "ObligacionPendiente" TO app_write;
    GRANT ALL PRIVILEGES ON TABLE "Actividad" TO app_write;
    GRANT ALL PRIVILEGES ON TABLE "PedidoCantidadAjuste" TO app_write;
    GRANT ALL PRIVILEGES ON TABLE "RecoveryDecision" TO app_write;
    GRANT ALL PRIVILEGES ON TABLE "ReceivableEntry" TO app_write;
    GRANT ALL PRIVILEGES ON TABLE "ResponsibilityCase" TO app_write;
    GRANT ALL PRIVILEGES ON TABLE "PromotionRule" TO app_write;
    GRANT USAGE, SELECT ON SEQUENCE pedido_numero_seq TO app_write;
    GRANT USAGE, SELECT ON SEQUENCE nota_credito_numero_seq TO app_write;
  END IF;
END $$;
