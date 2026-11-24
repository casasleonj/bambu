#!/usr/bin/env bash
# Regression #992: execute the real production migration on disposable PostgreSQL 17.
# This deliberately starts WITHOUT prisma db push, which would hide schema drift.
# Only execute within the ephemeral GitHub Actions PostgreSQL service container.
set -euo pipefail

if [ "$GITHUB_ACTIONS" != "true" ] || [ "$CI" != "true" ]; then
  echo "ERROR: test #992 only runs in isolated GitHub Actions CI." >&2
  exit 1
fi

MIGRATION="prisma/migrations/20261123_deuda_trabajador_plan_pago_992/migration.sql"
test -f "$MIGRATION"
docker exec postgres pg_isready -U bambu >/dev/null

psql_test() {
  local db="$1"
  docker exec -i postgres psql -X -U bambu -d "$db" -v ON_ERROR_STOP=1
}

cleanup() {
  docker exec postgres dropdb --if-exists -U bambu mig992_old >/dev/null 2>&1 || true
  docker exec postgres dropdb --if-exists -U bambu mig992_partial >/dev/null 2>&1 || true
  docker exec postgres dropdb --if-exists -U bambu mig992_invalid >/dev/null 2>&1 || true
  docker exec postgres dropdb --if-exists -U bambu mig992_default >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker exec postgres createdb -U bambu mig992_old
docker exec postgres createdb -U bambu mig992_partial
docker exec postgres createdb -U bambu mig992_invalid
docker exec postgres createdb -U bambu mig992_default

# Case A: both columns missing. Keep synthetic existing debt data unchanged.
psql_test mig992_old <<'SQL' >/dev/null
CREATE TABLE public."DeudaTrabajador" ("id" TEXT PRIMARY KEY, "montoPendiente" NUMERIC(10,2));
INSERT INTO public."DeudaTrabajador" VALUES ('synthetic', 100.25);
SQL
psql_test mig992_old < "$MIGRATION" >/dev/null
psql_test mig992_old < "$MIGRATION" >/dev/null # idempotent: run twice
psql_test mig992_old <<'SQL' >/dev/null
DO $test$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='DeudaTrabajador'
        AND column_name IN ('plazoNominas','porcentajePorNomina')
        AND data_type='integer' AND is_nullable='YES'
        AND column_default IS NULL) <> 2 THEN
    RAISE EXCEPTION 'Migration #992 does not create both nullable INTEGER columns';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."DeudaTrabajador"
    WHERE "id"='synthetic' AND "montoPendiente"=100.25
      AND "plazoNominas" IS NULL AND "porcentajePorNomina" IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration #992 changed synthetic historical data';
  END IF;
END
$test$;
SQL
echo "PASS #992: old schema migrated, repeated migration safe, data preserved"

# Case B: a partially deployed compatible column with a non-null existing value.
psql_test mig992_partial <<'SQL' >/dev/null
CREATE TABLE public."DeudaTrabajador" ("id" TEXT PRIMARY KEY, "plazoNominas" INTEGER);
INSERT INTO public."DeudaTrabajador" VALUES ('synthetic', 4);
SQL
psql_test mig992_partial < "$MIGRATION" >/dev/null
psql_test mig992_partial <<'SQL' >/dev/null
DO $test$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."DeudaTrabajador"
                 WHERE "id"='synthetic' AND "plazoNominas"=4
                       AND "porcentajePorNomina" IS NULL) THEN
    RAISE EXCEPTION 'Migration #992 damaged partial deployment';
  END IF;
END
$test$;
SQL
echo "PASS #992: compatible partial deployment preserved"

# Case C: a preexisting incompatible type must fail without adding the other column.
psql_test mig992_invalid <<'SQL' >/dev/null
CREATE TABLE public."DeudaTrabajador" ("id" TEXT PRIMARY KEY, "plazoNominas" TEXT);
INSERT INTO public."DeudaTrabajador" VALUES ('synthetic', 'original');
SQL
if psql_test mig992_invalid < "$MIGRATION" >/dev/null 2>&1; then
  echo "FAIL #992: incompatible TEXT column was accepted" >&2
  exit 1
fi
psql_test mig992_invalid <<'SQL' >/dev/null
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='DeudaTrabajador'
             AND column_name='porcentajePorNomina') THEN
    RAISE EXCEPTION 'Migration #992 partially committed after error';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."DeudaTrabajador"
                 WHERE "id"='synthetic' AND "plazoNominas"='original') THEN
    RAISE EXCEPTION 'Migration #992 changed incompatible historical data';
  END IF;
END
$test$;
SQL
echo "PASS #992: bad column type rejected atomically"

# Case D: column with a preexisting DEFAULT must also be rejected atomically.
psql_test mig992_default <<'SQL' >/dev/null
CREATE TABLE public."DeudaTrabajador" ("id" TEXT PRIMARY KEY, "plazoNominas" INTEGER DEFAULT 2);
SQL
if psql_test mig992_default < "$MIGRATION" >/dev/null 2>&1; then
  echo "FAIL #992: unexpected default was accepted" >&2
  exit 1
fi
psql_test mig992_default <<'SQL' >/dev/null
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='DeudaTrabajador'
             AND column_name='porcentajePorNomina') THEN
    RAISE EXCEPTION 'Migration #992 partially committed after DEFAULT error';
  END IF;
END
$test$;
SQL
echo "PASS #992: incompatible default rejected atomically"
