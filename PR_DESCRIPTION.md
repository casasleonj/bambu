# Descripción de PR — feat/1fn-migration-contactos-plantillaproducto

## Resumen
Migración 1FN (Primera Forma Normal) de las 2 violaciones restantes: `Cliente.contactos` (array JSON) y `PlantillaRecurrente.productos` (objeto JSON) → tablas relacionales `ContactoCliente` y `PlantillaProducto`. Patrón Expand-Contract (Parallel Change) en 3 fases, sin downtime.

## Fases

| Fase | Tag | Descripción |
|------|-----|-------------|
| 1 EXPAND | `deploy/1fn-fase1-expand` | Crear tablas + relaciones. Additive, 100% reversible. |
| 2 MIGRATE | `deploy/1fn-fase2-migrate` | Backfill + dual-write + lecturas con hidratación legacy. |
| 3 CONTRACT | `deploy/1fn-fase3-contract` | Drop columnas legacy, rename, UI ajustada. |

## Cambios principales

- **Schema Prisma** (`prisma/schema.prisma`):
  - + `model ContactoCliente` con `@@unique([clienteId, telefono])` y FK Cascade.
  - + `model PlantillaProducto` con `@@unique([plantillaId, producto])` y FK Cascade.
  - **Drop** de `Cliente.contactos Json?` y `PlantillaRecurrente.productos String`.
  - Relaciones `contactos: ContactoCliente[]` y `productos: PlantillaProducto[]` (nombre final).

- **Migraciones SQL** (5 archivos en `prisma/migrations/`):
  - `20260610_expand_contactos_productos/` — Crea las 2 tablas.
  - `20260610_add_unique_cliente_telefono/` — Índice único para upsert.
  - `20260610_backfill_contactos_productos/` — Backfill idempotente paginado (corrige bug F1 de loop infinito).
  - `20260610_contract_drop_contactos_productos/` — Drop de columnas legacy.
  - `20260610_grant_permissions_new_tables/` — GRANTs a `app_write`.

- **Backend** (10 archivos):
  - `src/lib/cliente-hydrate.ts` (nuevo, reducido en Fase 3 a solo `hydrateProductos`).
  - `src/lib/recurrentes.ts` — Lee desde `productos` (relación).
  - `src/lib/validators.ts` — Removido `contactos` del Zod schema.
  - `src/app/api/clientes/route.ts` — Búsqueda por relación, GET hidrata contactos.
  - `src/app/api/clientes/quick/route.ts` — Búsqueda por relación.
  - `src/app/api/clientes/[id]/route.ts` — PUT con `prisma.$transaction` (dual-write en Fase 2).
  - `src/app/api/recurrentes/route.ts` — POST/PUT con dual-write en Fase 2.
  - `src/app/api/pedidos/recurrentes/route.ts` — Include de `productos`.
  - `src/app/(app)/recurrentes/[id]/page.tsx` — Hidrata productos al shape legacy.
  - `prisma/seed-realista.ts` — Crea productos via nested write.

- **Frontend** (1 archivo):
  - `src/app/(app)/clientes/clientes-client/cliente-form.tsx` — Maneja `productos` como array (Fase 3).

- **Tests** (1 archivo):
  - `src/app/api/clientes/[id]/__tests__/route.test.ts` — Test actualizado 2 veces (regex acepta `tx.contactoCliente` o `prisma.cliente.updateMany`).

- **Docs**:
  - `AGENTS.md` — Sección "1FN Normalization" + issue #10.
  - `docs/superpowers/plans/2026-06-10-1fn-migration-contactos-productos.md` — Plan completo con notas de ejecución.

## Verificación

- `npx tsc --noEmit`: ✅ pasa
- `npm run test`: ✅ 1062/1062 tests pasan
- `npm run build`: ✅ pasa
- Backfill: ✅ 2 contactos insertados, 0 duplicados al re-ejecutar
- `information_schema`: ✅ 0 filas para `contactos`/`productos` legacy
- E2E manual (curl): ✅ GET con `?all=true` devuelve contactos hidratados; POST simple OK; POST con `contactos: [...]` rechazado (Zod) en Fase 3

## Estrategia de merge recomendada

⚠️ **No mergear todo de una vez**. Hacer 3 PRs separados:

1. PR Fase 1: `git checkout deploy/1fn-fase1-expand` → merge a main → deploy
2. PR Fase 2: `git checkout deploy/1fn-fase2-migrate` → merge → deploy → drenar 24h
3. PR Fase 3: `git checkout deploy/1fn-fase3-contract` → merge → deploy

(El plan completo con todo el código está en un solo branch para revisión, pero los deploys deben ser por fase.)

## Gap conocido (trabajo futuro)

⚠️ **El CRUD de contactos desde la UI no quedó implementado**. El form (`cliente-form.tsx`) muestra contactos existentes pero no puede agregar/editar nuevos porque el Zod de Fase 3 removió `contactos` del body. Para hacerlo funcional falta:
- `POST /api/clientes/[id]/contactos`
- `DELETE /api/clientes/[id]/contactos/[contactoId]`
- Actualizar `cliente-form.tsx` para usar esos endpoints

Esto NO bloquea el merge de la 1FN (el storage es correcto), pero bloquea la funcionalidad de UI. Documentado en `AGENTS.md` issue #10.

## Para Supabase prod

1. **Verificar GRANTs** sobre `ContactoCliente` y `PlantillaProducto` para el rol que use el runtime.
2. **Backup antes de Fase 3** (es irreversible).
3. **Drenar 24h** entre Fase 2 y Fase 3 en prod.

## Issues relacionados

- #7 NEXTAUTH_URL (resuelto, sin cambios en esta migración)
- #8 Test 291 ECONNRESET (resuelto, sin cambios)
- #9 Errores TS fantasma `.next/dev/types/validator.ts` (resuelto, sin cambios)

## Archivos borrados

- `prisma/migrations/0_init/` (legacy duplicado del init, limpiado para evitar shadow DB issues)
- `src/lib/parseProductos` (eliminado de `recurrentes.ts`, ahora `hydrateProductos`)
- `productosToJson` (eliminado de `recurrentes/route.ts`)

## Reviewers sugeridos

- Backend: revisar 4 archivos en `src/app/api/clientes/` y `src/app/api/recurrentes/`
- DB: revisar las 5 migraciones SQL, especialmente el backfill paginado
- Frontend: revisar `cliente-form.tsx` (1 archivo, cambio mínimo)
- Docs: revisar `AGENTS.md` y el plan completo en `docs/superpowers/plans/`
