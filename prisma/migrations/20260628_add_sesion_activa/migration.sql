-- Migración: add_sesion_activa
--
-- Crea la tabla SesionActiva para el feature de límite de dispositivos
-- simultáneos (commit a81e742). El modelo ya está en prisma/schema.prisma
-- pero faltaba esta migración, lo que causaba que las DBs creadas con
-- `prisma db push` ANTES de ese commit (incluyendo Supabase prod) no
-- tuvieran la tabla. La app lanzaba P2021 al consultarla en el callback
-- JWT, invalidando sesiones recién creadas.
--
-- Idempotente: usa IF NOT EXISTS / DO $$ para que sea seguro re-ejecutar.
-- Aplicar con `psql` o `prisma db execute`, NO con `prisma migrate deploy`
-- (issue #12 del AGENTS.md: la tabla _prisma_migrations no está sincronizada).

CREATE TABLE IF NOT EXISTS "SesionActiva" (
  id          TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  rol         "RolUsuario" NOT NULL,
  "userAgent" TEXT,
  ip          TEXT,
  dispositivo TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActive" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "SesionActiva_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS "SesionActiva_sessionId_key"
  ON "SesionActiva" ("sessionId");

CREATE INDEX IF NOT EXISTS "SesionActiva_usuarioId_expiresAt_idx"
  ON "SesionActiva" ("usuarioId", "expiresAt");

CREATE INDEX IF NOT EXISTS "SesionActiva_expiresAt_idx"
  ON "SesionActiva" ("expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'SesionActiva_usuarioId_fkey'
      AND table_name = 'SesionActiva'
  ) THEN
    ALTER TABLE "SesionActiva"
      ADD CONSTRAINT "SesionActiva_usuarioId_fkey"
      FOREIGN KEY ("usuarioId") REFERENCES "User"(id)
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

-- Permisos: app_write hace CRUD en runtime, app_read solo SELECT (si existe).
-- En prod actual la app conecta como `postgres`, pero el role `app_write`
-- ya existe (verificado en Supabase MCP) y se usa en dev, así que
-- mantener consistencia. app_read es opcional: no todas las instancias lo
-- tienen creado.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "SesionActiva" TO app_write;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'app_read'
  ) THEN
    GRANT SELECT ON TABLE "SesionActiva" TO app_read;
  END IF;
END $$;
