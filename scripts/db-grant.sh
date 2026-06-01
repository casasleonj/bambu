#!/usr/bin/env bash
# Re-applies PostgreSQL permissions for app_write and app_read roles.
# Required after `prisma db push --force-reset` or initial DB setup.
# The init.sql ALTER DEFAULT PRIVILEGES only apply to NEW tables created by bambu
# AFTER the SQL ran. Reset operations drop & recreate, losing prior grants.
#
# Usage:
#   ./scripts/db-grant.sh
#   npm run db:grant

set -e

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"
DB_NAME="${DB_NAME:-bambu}"
DB_USER="${DB_USER:-bambu}"
DB_PASS="${DB_PASS:-bambu_dev}"

PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<'SQL'
-- Schema access
GRANT USAGE ON SCHEMA public TO app_write, app_read;
GRANT USAGE ON SCHEMA graphile_worker TO app_write, app_read;

-- Existing tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_write;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_read;

-- Sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_write;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO app_read;

-- Verify
SELECT
  'app_write: ' || has_schema_privilege('app_write', 'public', 'USAGE')::text ||
  ' | tables: ' || (SELECT COUNT(*) FROM information_schema.role_table_grants WHERE grantee = 'app_write' AND table_schema = 'public')::text
  AS status;
SQL

echo "✓ Database grants applied"
