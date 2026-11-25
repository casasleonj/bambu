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

## Registrar cada migración aplicada (#409)

Cada migración que se aplica en producción debe quedar **registrada** en `_prisma_migrations` en el mismo momento. Si no, `prisma migrate status` reporta deriva y un `migrate deploy` intentaría aplicarla de nuevo.

- **Con la CLI** (requiere `DIRECT_URL` de producción): `npx prisma migrate resolve --applied <nombre>`.
- **Por SQL** (cuando se aplica con el MCP de Supabase, sin CLI): el `checksum` es el sha256 del archivo, igual que el de `migrate resolve`. **Nunca** un texto fijo como `manual-apply-via-mcp`.

```bash
m=<nombre>   # p. ej. 20261024_pago_tres_fechas_regularizacion
echo "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
SELECT '$(cat /proc/sys/kernel/random/uuid)', '$(sha256sum prisma/migrations/$m/migration.sql | cut -c1-64)', now(), '$m', now(), 1
WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '$m' AND rolled_back_at IS NULL);"
```

Orden: aplicar la migración → verificar con una consulta de solo lectura que sus objetos existen → registrarla → recién entonces mergear el PR (AGENTS.md, Flujo de Entrega, paso 7).

Comprobación: las filas con `rolled_back_at IS NULL` deben ser exactamente las carpetas de `prisma/migrations/` (sin `migration_lock.toml`). Al 2026-11-02 son 71 y 71.

## Recuperar una migración aplicada pero no registrada (#1017)

**Síntoma:** `migrate-deploy` falla en "Conciliar checksum e historial ANTES de DDL" con `Migración histórica no registrada: <nombre>` en pushes que no tocan esa migración. Ocurre cuando el run del push de la migración falló (token, red) y su SQL quedó aplicado fuera del flujo sin fila en `_prisma_migrations`.

**No** se relaja el preflight ni se escribe a mano en producción. Procedimiento (workflow `migrate-recover.yml`, solo `workflow_dispatch` en `main`, con aprobación del entorno `production`, sin DDL):

1. Leer el `migration.sql` y listar **todos** los objetos que crea, con la gramática: `tabla:X`, `columna:tabla.col`, `funcion:f`, `trigger:tabla.trg`, `indice:idx` (separados por coma).
2. Lanzar el workflow con `registrar=false`. Verifica que la migración existe en Git, que es la **única** sin registrar, que no tiene filas previas (fallida/revertida exige revisión manual), que el resto del ledger y sus checksums son íntegros y que cada objeto declarado existe en producción (consultas de catálogo de solo lectura).
3. Si pasó, lanzar de nuevo con `registrar=true`: ejecuta `prisma migrate resolve --applied <nombre>` (checksum = sha256 del archivo, el mismo de `migrate deploy`) y concilia el ledger completo (`--postflight`).
4. Reintentar ("Re-run failed jobs") los runs fallidos de `migrate-deploy` del SHA que se quiera liberar: `release-migration-gate` exige un run exitoso de ese SHA exacto.

**Límite:** la lista de objetos la declara una persona; el código prueba que existen, no que el SQL se aplicó completo (p. ej. una migración sin transacción que falló a mitad). La aprobación del entorno `production` es el control humano. Si falta un objeto, el workflow se detiene: aplicar/corregir por el flujo normal y revisar con el PO.
