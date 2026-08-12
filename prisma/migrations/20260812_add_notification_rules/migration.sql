-- Migration: sistema de notificaciones configurable (rol/usuario por
-- tipo de evento).
--
-- Reemplaza el broadcastPush() sin filtrar (mandaba a TODAS las
-- suscripciones activas sin importar rol/relevancia) por un ruteo
-- explícito: por cada NotificationEventType, un ADMIN elige qué roles
-- y/o qué usuarios específicos reciben el aviso.
--
-- Puramente additiva (sin backfill desde columna existente) — no
-- requiere el patrón expand-contract de 3 fases usado para
-- ContactoCliente/PlantillaProducto.
--
-- Idempotente: CREATE TYPE/TABLE IF NOT EXISTS + IF NOT EXISTS en
-- constraints, para poder re-aplicar sin error.

-- 1. Enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationEventType') THEN
    CREATE TYPE "NotificationEventType" AS ENUM (
      'CLIENTE_CREADO',
      'PEDIDO_CREADO',
      'EMBARQUE_CERRADO',
      'PEDIDO_ENTREGADO',
      'PEDIDO_CULMINADO',
      'FIADO_GENERADO',
      'ABONO_APLICADO',
      'CIERRE_DIA_COMPLETADO',
      'GASTO_CREADO',
      'COMPRA_CREADA',
      'CASO_ALTA'
    );
  END IF;
END $$;

-- 2. NotificationRule
CREATE TABLE IF NOT EXISTS "NotificationRule" (
  "id"        TEXT NOT NULL,
  "eventType" "NotificationEventType" NOT NULL,
  "enabled"   BOOLEAN NOT NULL DEFAULT true,
  "roles"     "RolUsuario"[] NOT NULL DEFAULT ARRAY[]::"RolUsuario"[],
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationRule_eventType_key"
  ON "NotificationRule" ("eventType");

-- 3. NotificationRuleTargetUser
CREATE TABLE IF NOT EXISTS "NotificationRuleTargetUser" (
  "id"     TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "NotificationRuleTargetUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationRuleTargetUser_ruleId_userId_key"
  ON "NotificationRuleTargetUser" ("ruleId", "userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NotificationRuleTargetUser_ruleId_fkey'
  ) THEN
    ALTER TABLE "NotificationRuleTargetUser"
      ADD CONSTRAINT "NotificationRuleTargetUser_ruleId_fkey"
      FOREIGN KEY ("ruleId") REFERENCES "NotificationRule"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NotificationRuleTargetUser_userId_fkey'
  ) THEN
    ALTER TABLE "NotificationRuleTargetUser"
      ADD CONSTRAINT "NotificationRuleTargetUser_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "NotificationRuleTargetUser_ruleId_idx"
  ON "NotificationRuleTargetUser" ("ruleId");

CREATE INDEX IF NOT EXISTS "NotificationRuleTargetUser_userId_idx"
  ON "NotificationRuleTargetUser" ("userId");

-- 4. Grants (app_write/app_read pueden no existir en algunos entornos —
-- guardado igual que 20260612_add_push_subscription).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "NotificationRule" TO app_write;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "NotificationRuleTargetUser" TO app_write;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_read') THEN
    GRANT SELECT ON "NotificationRule" TO app_read;
    GRANT SELECT ON "NotificationRuleTargetUser" TO app_read;
  END IF;
END $$;
