-- Create application roles (non-superuser) for security hardening
-- bambu remains as superuser only for migrations and DB administration

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_write') THEN
    CREATE ROLE app_write WITH LOGIN PASSWORD 'bambu_app_write' INHERIT;
  END IF;
  
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_read') THEN
    CREATE ROLE app_read WITH LOGIN PASSWORD 'bambu_app_read' INHERIT;
  END IF;
END
$$;

-- Grant schema access
GRANT CONNECT ON DATABASE bambu TO app_read, app_write;
GRANT USAGE ON SCHEMA public TO app_read, app_write;
GRANT USAGE ON SCHEMA graphile_worker TO app_read, app_write;

-- Grant table permissions (existing tables)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_read;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_write;

-- Grant sequence permissions (Prisma needs sequences for auto-increment IDs)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_write;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO app_read;

-- Ensure future tables get the same permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_read;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_write;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_write;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO app_read;
