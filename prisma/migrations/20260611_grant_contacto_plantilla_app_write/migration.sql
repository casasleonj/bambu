-- Migration: grant_contacto_plantilla_app_write
-- Date: 2026-06-11
-- Purpose: Fix HTTP 500 caused by `permission denied for table ContactoCliente`
--   (and PlantillaProducto) when the app_read/app_write roles query these
--   tables via Prisma `include`.
--
-- Root cause: the 01-roles.sql ALTER DEFAULT PRIVILEGES did not persist in
-- pg_default_acl in this environment (or the script ran before the role
-- existed). Result: tables created by later Prisma migrations did not
-- inherit grants automatically. ALL TABLES in 01-roles.sql only covers
-- tables that exist at init time.
--
-- This migration:
--   1. Grants explicit table permissions to ContactoCliente + PlantillaProducto
--      for both app_write (read+write) and app_read (read-only).
--   2. Re-applies the ALTER DEFAULT PRIVILEGES so future Prisma-created
--      tables inherit the same grants automatically.
--
-- Idempotent: GRANT and ALTER DEFAULT PRIVILEGES do not fail on re-run.
-- Safe in Supabase: only references the same roles created by 01-roles.sql
--   (app_write, app_read). If the role does not exist (unlikely in prod),
--   the statement will fail; the deploy script should ensure roles exist.

-- 1. Explicit grants on the 1FN-migration tables
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ContactoCliente" TO app_write;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "PlantillaProducto" TO app_write;
GRANT SELECT ON TABLE "ContactoCliente" TO app_read;
GRANT SELECT ON TABLE "PlantillaProducto" TO app_read;

-- 2. Re-apply ALTER DEFAULT PRIVILEGES (safety net for future tables).
-- Wrapped in DO blocks so missing roles (e.g. postgres in dev) don't break
-- the migration; bambu is always present in dev, postgres only in Supabase.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bambu') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE bambu IN SCHEMA public GRANT SELECT ON TABLES TO app_read';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE bambu IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_write';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE bambu IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_write';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE bambu IN SCHEMA public GRANT SELECT ON SEQUENCES TO app_read';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO app_read';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_write';
  END IF;
END $$;
