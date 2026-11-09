#!/usr/bin/env bash
# Aplica las migraciones SQL que `prisma db push` no crea (ver scripts/migraciones-sql-crudas.txt).
#
# Uso (después de `npx prisma db push`):
#   bash scripts/aplicar-migraciones-sql-crudas.sh
#
# Conexión: DIRECT_URL, o DATABASE_URL si no hay; se toma del entorno o de .env.
# Es la MISMA lista y el mismo orden que usa CI (jobs integration, e2e y e2e-hub), así la base
# local queda con las mismas restricciones. Idempotente: se puede correr más de una vez.
# Se niega a correr contra una base de Supabase (producción): allí las migraciones se aplican aparte.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LISTA="$RAIZ/scripts/migraciones-sql-crudas.txt"

# Variables del .env solo si no vienen del entorno (sin ejecutar el archivo).
leer_env() {
  local nombre="$1"
  [ -f "$RAIZ/.env" ] || return 0
  grep -E "^${nombre}=" "$RAIZ/.env" | head -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true
}
URL="${DIRECT_URL:-${DATABASE_URL:-}}"
[ -n "$URL" ] || URL="$(leer_env DIRECT_URL)"
[ -n "$URL" ] || URL="$(leer_env DATABASE_URL)"
if [ -z "$URL" ]; then
  echo "ERROR: define DIRECT_URL o DATABASE_URL (o crea .env desde .env.example)." >&2
  exit 1
fi
URL="${URL%%\?*}" # psql no entiende parámetros de Prisma como ?schema=public o ?pgbouncer=true

case "$URL" in
  *supabase*)
    echo "ERROR: la URL apunta a Supabase. Este script es solo para bases de desarrollo y pruebas." >&2
    exit 1
    ;;
esac

command -v psql >/dev/null 2>&1 || { echo "ERROR: falta psql en el PATH." >&2; exit 1; }
[ -f "$LISTA" ] || { echo "ERROR: no existe $LISTA" >&2; exit 1; }

psql_() { psql "$URL" -v ON_ERROR_STOP=1 -q "$@"; }

# Las migraciones hacen GRANT a app_write; en una base efímera solo existe el superusuario.
psql_ -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_write') THEN CREATE ROLE app_write; END IF; END \$\$;"
# pg_trgm: db push no ejecuta CREATE EXTENSION (lo usan los matchers de importación).
psql_ -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

total=0
while IFS= read -r linea || [ -n "$linea" ]; do
  nombre="${linea%%#*}"
  nombre="$(echo "$nombre" | tr -d '[:space:]')"
  [ -n "$nombre" ] || continue
  archivo="$RAIZ/prisma/migrations/$nombre/migration.sql"
  [ -f "$archivo" ] || { echo "ERROR: falta $archivo" >&2; exit 1; }
  psql_ -f "$archivo" >/dev/null
  total=$((total + 1))
  echo "  ok  $nombre"
done < "$LISTA"

echo "Listo: $total migraciones SQL aplicadas."
