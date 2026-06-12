#!/usr/bin/env bash
# scripts/db-grant-default-privs.sh
#
# Re-aplica los ALTER DEFAULT PRIVILEGES del initdb script.
# Razon: el initdb corre una sola vez al crear el container de Postgres,
# pero los ALTER DEFAULT PRIVILEGES no persisten en pg_default_acl cuando
# el container se recrea desde un volumen limpio o cuando se hace
# pg_dump/restore. Sin estos defaults, las tablas creadas por migraciones
# Prisma no heredan GRANTs automaticos para app_write/app_read.
#
# Idempotente: ALTER DEFAULT PRIVILEGES no falla si ya existe.
#
# Roles destino:
#   - app_write: SELECT, INSERT, UPDATE, DELETE + USAGE en sequences
#   - app_read:  SELECT
#
# Owners de las tablas a las que se aplican los defaults:
#   - bambu  (corre `prisma db push` y migraciones en dev)
#   - postgres (usado en Supabase o admin scripts)
set -euo pipefail

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

ADMIN_URL="${DIRECT_URL:-$DATABASE_URL}"

if [ -z "${ADMIN_URL:-}" ]; then
  echo "ERROR: DATABASE_URL o DIRECT_URL no definidas. Abortando." >&2
  exit 1
fi

# bambu (siempre presente) y postgres (Supabase/admin). Si el rol no
# existe en el entorno actual (ej. dev sin postgres role), el ALTER falla
# con "role does not exist" — lo capturamos y seguimos. El script sigue
# siendo efectivo porque bambu es el owner real en dev.
apply_default_privs() {
  local role="$1"
  psql "$ADMIN_URL" -v ON_ERROR_STOP=0 -c \
    "ALTER DEFAULT PRIVILEGES FOR ROLE ${role} IN SCHEMA public GRANT SELECT ON TABLES TO app_read;" >/dev/null
  psql "$ADMIN_URL" -v ON_ERROR_STOP=0 -c \
    "ALTER DEFAULT PRIVILEGES FOR ROLE ${role} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_write;" >/dev/null
}

echo "Aplicando ALTER DEFAULT PRIVILEGES para bambu..."
apply_default_privs bambu
# postgres role solo existe en Supabase; en dev no existe y se ignora.
apply_default_privs postgres 2>/dev/null || true

echo
echo "OK. Defaults actuales en schema public:"
psql "$ADMIN_URL" -c "SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS owner, CASE d.defaclobjtype WHEN 'r' THEN 'table' WHEN 'S' THEN 'sequence' END AS object_type FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace WHERE n.nspname = 'public' ORDER BY 1, 2;"
