-- Migration: add_planificador
-- Date: 2026-08-30
-- Purpose: F2 del modulo Rutas/Planificador. Agregado nuevo de planificacion de
--   distribucion. Contratos: docs/adr/ADR-PLANIFICADOR-00{1..6}.md
--
-- Aditivo puro: 6 tablas + 2 enums. CERO cambios a tablas existentes. El
--   planificador referencia Cliente/Negocio/Trabajador/Ruta/Embarque/Pedido por
--   id (sin FK) -- no es dueno de esos dominios (ADR-PLANIFICADOR-002). Solo las
--   relaciones internas PlanDia->Grupo->Parada->Actividad + satelites
--   (PlanDiaVersion, PlanExcepcion) tienen FK ON DELETE CASCADE.

CREATE TYPE "PlanEstado" AS ENUM ('PROPOSED', 'REVIEW', 'CONFIRMED', 'SUPERSEDED', 'CANCELLED', 'INTEGRATION_PARTIAL');
CREATE TYPE "PlanActividadTipo" AS ENUM ('ENTREGA', 'COBRO', 'RECOGIDA_BOTELLON');

-- CreateTable
CREATE TABLE "PlanDia" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "estado" "PlanEstado" NOT NULL DEFAULT 'PROPOSED',
    "generadoPorId" TEXT,
    "confirmadoPorId" TEXT,
    "causa" TEXT,
    "resumen" JSONB,
    "generadoEn" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadoEn" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "confirmOfflineId" TEXT,

    CONSTRAINT "PlanDia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanDiaVersion" (
    "id" TEXT NOT NULL,
    "planDiaId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "diff" JSONB,
    "actorId" TEXT,
    "causa" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanDiaVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanGrupo" (
    "id" TEXT NOT NULL,
    "planDiaId" TEXT NOT NULL,
    "nombreLogico" TEXT NOT NULL,
    "secuencia" INTEGER NOT NULL DEFAULT 0,
    "capacidadUnidades" INTEGER NOT NULL DEFAULT 0,
    "cargaPlanificada" JSONB NOT NULL,
    "trabajadorPropuestoId" TEXT,
    "trabajadorFinalId" TEXT,
    "rutaId" TEXT,
    "horaSalidaPropuesta" TEXT,
    "score" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "explicacion" JSONB,
    "embarqueId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "PlanGrupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanParada" (
    "id" TEXT NOT NULL,
    "planGrupoId" TEXT NOT NULL,
    "secuencia" INTEGER NOT NULL DEFAULT 0,
    "clienteId" TEXT NOT NULL,
    "negocioId" TEXT,
    "ubicacionUsada" JSONB,
    "motivo" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "PlanParada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanActividad" (
    "id" TEXT NOT NULL,
    "planParadaId" TEXT NOT NULL,
    "tipo" "PlanActividadTipo" NOT NULL DEFAULT 'ENTREGA',
    "pedidoIds" TEXT[],
    "snapshotCantidades" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "PlanActividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanExcepcion" (
    "id" TEXT NOT NULL,
    "planDiaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "severidad" TEXT NOT NULL DEFAULT 'MEDIA',
    "entidad" JSONB,
    "explicacion" TEXT NOT NULL,
    "opciones" JSONB,
    "estado" TEXT NOT NULL DEFAULT 'ABIERTA',
    "resueltaPorId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "PlanExcepcion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanDia_confirmOfflineId_key" ON "PlanDia"("confirmOfflineId");
CREATE INDEX "PlanDia_fecha_estado_idx" ON "PlanDia"("fecha", "estado");
CREATE INDEX "PlanDia_fecha_version_idx" ON "PlanDia"("fecha", "version");
CREATE INDEX "PlanDiaVersion_planDiaId_idx" ON "PlanDiaVersion"("planDiaId");
CREATE UNIQUE INDEX "PlanDiaVersion_planDiaId_version_key" ON "PlanDiaVersion"("planDiaId", "version");
CREATE INDEX "PlanGrupo_planDiaId_idx" ON "PlanGrupo"("planDiaId");
CREATE INDEX "PlanGrupo_embarqueId_idx" ON "PlanGrupo"("embarqueId");
CREATE INDEX "PlanParada_planGrupoId_idx" ON "PlanParada"("planGrupoId");
CREATE INDEX "PlanParada_clienteId_idx" ON "PlanParada"("clienteId");
CREATE INDEX "PlanActividad_planParadaId_idx" ON "PlanActividad"("planParadaId");
CREATE INDEX "PlanActividad_pedidoIds_idx" ON "PlanActividad" USING GIN ("pedidoIds");
CREATE INDEX "PlanExcepcion_planDiaId_idx" ON "PlanExcepcion"("planDiaId");
CREATE INDEX "PlanExcepcion_planDiaId_estado_idx" ON "PlanExcepcion"("planDiaId", "estado");

ALTER TABLE "PlanDiaVersion" ADD CONSTRAINT "PlanDiaVersion_planDiaId_fkey" FOREIGN KEY ("planDiaId") REFERENCES "PlanDia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanGrupo" ADD CONSTRAINT "PlanGrupo_planDiaId_fkey" FOREIGN KEY ("planDiaId") REFERENCES "PlanDia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanParada" ADD CONSTRAINT "PlanParada_planGrupoId_fkey" FOREIGN KEY ("planGrupoId") REFERENCES "PlanGrupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanActividad" ADD CONSTRAINT "PlanActividad_planParadaId_fkey" FOREIGN KEY ("planParadaId") REFERENCES "PlanParada"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanExcepcion" ADD CONSTRAINT "PlanExcepcion_planDiaId_fkey" FOREIGN KEY ("planDiaId") REFERENCES "PlanDia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grants (runtime usa app_write en Docker, postgres en Supabase).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "PlanDia", "PlanDiaVersion", "PlanGrupo", "PlanParada", "PlanActividad", "PlanExcepcion"
  TO app_write;
GRANT SELECT ON TABLE
  "PlanDia", "PlanDiaVersion", "PlanGrupo", "PlanParada", "PlanActividad", "PlanExcepcion"
  TO app_read;
