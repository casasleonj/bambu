# Despliegue de migraciones — plan maestro de ledgers

La migración `20260817_plan_maestro_ledgers` es **consolidada, completa e idempotente**: crea los enums, tablas, columnas, índices, FKs, CHECK constraints y secuencias del plan maestro (FASES 1–8 + FINAL).

## Flujo real del repo

El proyecto usa `db push` como fuente de verdad (NO `migrate deploy`), documentado en AGENTS.md issue #12. Por eso:

1. `prisma db push` crea las **tablas/enums/columnas**.
2. Las **migraciones SQL** (`prisma/migrations/*/migration.sql`) aportan lo que Prisma no genera: **CHECK constraints, secuencias, índices parciales y GRANTs**.
3. `prisma migrate resolve --applied <nombre>` registra la migración en `_prisma_migrations` para tracking.

## Pasos para producción (Supabase)

```bash
# 1. Sincronizar schema (crea tablas/enums/columnas) contra la DB de producción
DATABASE_URL="postgresql://postgres:[password]@db.[ref].supabase.co:6543/postgres?pgbouncer=true" \
DIRECT_URL="postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres" \
npx prisma db push

# 2. Aplicar CHECKs, secuencias, índices parciales y GRANTs (idempotente)
psql "$DIRECT_URL" -f prisma/migrations/20260817_plan_maestro_ledgers/migration.sql

# 3. Registrar la migración en _prisma_migrations (tracking)
npx prisma migrate resolve --applied 20260817_plan_maestro_ledgers
```

## Notas

- **Idempotente**: re-ejecutar el SQL es seguro (`IF NOT EXISTS` / `DO $$ IF NOT EXISTS`). Los GRANTs son condicionales (solo si el rol `app_write` existe; en Supabase el owner es `postgres` y no requiere GRANT).
- **Secuencias**: `pedido_numero_seq` y `nota_credito_numero_seq` arrancan en `MAX(numero)+1`; el serial subyacente de `Pedido.numero` se sincroniza solo si hay datos (evita `setval(0)` fuera de rango).
- **Duplicado `init` pre-existente**: el repo tiene `0_init` y `20260430061138_init` (ambas crean `EstadoPedido`). `migrate deploy` desde cero falla con "type already exists" — este es el issue #12 de AGENTS.md, **no** algo introducido por el plan maestro. El flujo correcto es `db push` + psql + `migrate resolve`.
