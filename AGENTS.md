# PROTOCOLO OBLIGATORIO

ANTES de escribir cualquier codigo, DEBES ejecutar las 3 iteraciones del protocolo de investigacion.
Lee el archivo `.opencode/prompts/protocolo.txt` para los detalles completos.
NUNCA saltes directo a codigo. NUNCA implementes sin aprobacion tras cada Ronda 2.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agua Bambu v2 - Agent Guide

## Project Overview
ERP system for water & ice delivery business. 6 concurrent users, rural 2G/3G connectivity.

## Tech Stack
- Next.js 16.2.4 (App Router)
- React 19.2.4
- TypeScript 5.9.3
- NextAuth 5.0.0-beta.31 (Auth.js, JWT strategy)
- Prisma 6.19.3 + **PostgreSQL** (dev and production)
- Tailwind CSS 4.2.4
- Dexie 4.4.2 (offline-first IndexedDB)
- Zustand 5.0.12 (client state)
- Sonner 2.0.7 (toasts)
- Playwright 1.59.1 (E2E tests)
- Vitest 3.2.4 (unit tests)
- ESLint 9.39.4 (flat config)
- Redis 5.12.1 + rate-limiter-flexible 11.0.1 (distributed rate limiting)
- Sentry 10.55.0 (error tracking)
- Pino 10.3.1 (structured logging)
- Zod 4.3.6 (validation)
- Serwist 9.5.7 (PWA service worker)

**ALL dependency versions are pinned (no `^` or `~`).**

## Database

**ONE schema, ONE provider: PostgreSQL everywhere.**

- Local dev: PostgreSQL 17.10 Alpine via Docker Compose on port **5433** (`docker compose up -d`)
- Production: Supabase PostgreSQL
- There is NO SQLite schema. Do NOT create one.
- Monetary fields use `Decimal @db.Decimal(10, 2)` — cast with `Number(value)` in application code.

## Development Setup

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Install dependencies
npm install

# 3. Copy environment
cp .env.example .env

# 4. Generate Prisma client
npx prisma generate

# 5. Push schema to local DB
npx prisma db push

# 6. Seed initial data
npx tsx prisma/seed.ts

# 7. Run dev server
npm run dev
```

## Testing

```bash
# Unit tests (Vitest)
npm run test

# E2E tests (Playwright)
npm run test:e2e

# Type check
npx tsc --noEmit
```

## Deploy to Vercel + Supabase

### Environment Variables (Vercel Dashboard)

| Variable | Example Value |
|----------|---------------|
| `DATABASE_URL` | `postgresql://postgres:[password]@db.[ref].supabase.co:6543/postgres?pgbouncer=true` |
| `DIRECT_URL` | `postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://your-project.vercel.app` |
| `AUTH_TRUST_HOST` | `true` (required behind proxy / in dev) |

### Deploy

```bash
npx prisma db push
npx tsx prisma/seed.ts
vercel --prod
```

## Critical Architecture Decisions

### PostgreSQL Only
- Single `prisma/schema.prisma` with `provider = "postgresql"`
- Dev: Docker Compose PostgreSQL 17.10 Alpine (`docker compose up -d`)
- Prod: Supabase. Same schema, same provider, zero drift.
- Advisory locks (`pg_advisory_lock`) for sequence generation
- `Decimal` fields for all monetary values (precision matters)

### Proxy (formerly Middleware)
- Next.js 16 deprecated `middleware.ts` and renamed it to `proxy.ts`.
- `src/proxy.ts` runs on the Node.js runtime before routes are rendered.
- It handles **both** auth redirect (page routes) **and** rate limiting (API routes).
- API routes (`/api/*`): rate limited via `checkRateLimit()` from `src/lib/rate-limit.ts`. Health checks and cron jobs are excluded.
- Page routes: redirects unauthenticated requests to `/login` (with `callbackUrl`).
- Rate limiting uses Redis v5 with `useRedisPackage: true`, `disableOfflineQueue: true`, and `insuranceLimiter` (memory fallback).

### Rate Limiting
- Implemented in `src/proxy.ts` (not in individual route handlers).
- `rate-limiter-flexible` with Redis support (falls back to in-memory in dev).
- Auth limit: 10 req/15min in production, 1000 req/min in development.
- API limit: 300 req/min.
- Page limit: 600 req/min.
- Excluded paths: `/api/health`, `/api/cron/*`.
- Key config: `useRedisPackage: true` (required for redis v5), `disableOfflineQueue: true`, `insuranceLimiter` (memory fallback), `inMemoryBlockOnConsumed` (7x faster after limit reached).

### Offline-First Architecture
- Designed for 6 concurrent users on rural 2G/3G connectivity.
- Mutations never block on the network: enqueue to Dexie, return optimistic response, sync on reconnect.
- `src/lib/fetch-resilient.ts` — `fetchResilient(url, options)` wrapper:
  - `AbortController` with 10s timeout
  - On `TypeError`/`AbortError` (network error/timeout) → enqueue to `requestQueue` in Dexie, return `{ status: 'offline' }`
  - On 4xx/5xx → return `{ status: 'error' }` (NOT enqueued — logic errors, retrying won't help)
  - On 2xx → return `{ status: 'ok', data }`
  - Feature flag: `NEXT_PUBLIC_USE_RESILIENT_FETCH=false` for rollback to direct `fetch`
- `ResilientResult<T>` — discriminated union: `{ status: 'ok' | 'offline' | 'error', data?, error? }`
- **Server-side dedup via `offlineId`** (client generates `crypto.randomUUID()`):
  - `Pedido.offlineId` (@unique) — POST `/api/pedidos`, `/api/pedidos/[id]/anular`, `/entrega`, `/enviar`
  - `Pago.offlineId` (indexed, NOT unique) — POST `/api/pedidos/pagar-fiado` (rebuilds `pagosAplicados` summary from existing Pagos with same offlineId)
  - `Pedido.recurrenteBatchId` (indexed, NOT unique) — POST `/api/pedidos/recurrentes` (returns existing set)
  - `Embarque.offlineId` (indexed, NOT unique) — PUT `/api/embarques/[id]`; DELETE is idempotent (status check, not offlineId)
  - `Cliente.offlineId` (@unique) — POST `/api/clientes`
  - `Produccion.offlineId` (@unique) — POST `/api/produccion` (returns existing Produccion with `deduped: true`)
- **Dexie schema v4** adds `requestQueue` table: `{ id?, url, method, body, headers, offlineId, localEndpoint, createdAt }`
- **Sync trigger**: `connectivity-indicator.tsx` listens to `online` event + 30s poll → calls `syncWithServer()` which drains `requestQueue` (raw HTTP replay) AND `syncQueue` (legacy entity-based, kept for backward compat with `pedidos`/`clientes` entities in IndexedDB).
- **Sync outcomes** (per item in `requestQueue`): 200 → delete + synced++, 409 (conflict, dedup OK) → delete + conflict++, other 4xx/5xx → keep + failed++, network error → keep + failed++.
- **Toast contract**: `toast.success` (online result), `toast.info` (offline enqueued), `toast.error` (logic error).
- **Hooks expose** `pendingOffline: string[]` (offlineIds) and `lastResult: ResilientResult` for UI counters.

### 1FN Normalization — `Cliente.contactos` y `PlantillaRecurrente.productos`
- **Cerrado en migración `1fn-migration-contactos-plantillaproducto` (3 fases, expand-contract, sin downtime)**.
- Las dos violaciones de 1FN (arrays/objetos JSON como columna) ahora son tablas relacionales:
  - **`ContactoCliente`** — `id, clienteId, nombre, telefono, relacion?` con `@@unique([clienteId, telefono])` para upsert dedup, `@@index([clienteId])` y `@@index([telefono])` para búsquedas.
  - **`PlantillaProducto`** — `id, plantillaId, producto, cantidad` con `@@unique([plantillaId, producto])` y `@@index([plantillaId])`.
- Ambas con `onDelete: Cascade` (soft-delete del padre no afecta los hijos; solo `DELETE` real).
- **Shape en la API**:
  - `cliente.contactos` ahora es directamente `ContactoCliente[]` (Prisma nativo). NO se necesita hidratación para contactos.
  - `plantilla.productos` ahora es `PlantillaProducto[]` (array). Para consumidores que esperan el shape legacy `{PACA_AGUA: n, ...}`, usar `hydrateProductos()` de `@/lib/cliente-hydrate`.
- **Búsqueda por teléfono de contacto**: usar `cliente.contactos: { some: { telefono: X } }` en lugar del antiguo `contactos: { path: ['[*].telefono'], equals: X }` (eliminado).
- **Permisos**: el usuario de runtime (`app_write` en Docker, `postgres` en Supabase) necesita `GRANT` sobre las tablas nuevas. La migración `20260610_grant_permissions_new_tables` los aplica automáticamente.
- **CRUD de contactos desde la UI**: la 1FN storage está cerrada, pero el plan original no incluyó sub-endpoints para `POST/DELETE /api/clientes/[id]/contactos`. La UI cliente (`cliente-form.tsx`) muestra contactos existentes (GET los hidrata), pero **agregar/editar contactos vía el form no persiste en el backend** — el Zod de Fase 3 removió el campo `contactos` del body. Es trabajo futuro: crear `POST/DELETE /api/clientes/[id]/contactos` y actualizar la UI para usarlos.
- **Patrón Expand-Contract usado**: tablas additive → backfill idempotente paginado → dual-write → cambiar lecturas con hidratación → drop de columnas legacy. Ver `docs/superpowers/plans/2026-06-10-1fn-migration-contactos-productos.md` para el detalle.
- **Tags de deploy**: `deploy/1fn-fase1-expand`, `deploy/1fn-fase2-migrate`, `deploy/1fn-fase3-contract`.

### Service Worker (PWA)
- Serwist 9.5.7 genera el service worker en build a partir de `src/app/sw.ts`.
- El SW se sirve en `/serwist/sw.js` vía `src/app/serwist/[path]/route.ts`.
- Estrategia: Network-first para navegación, cache-first para assets estáticos; las APIs no se cachean.
- `SerwistProvider` (en `src/app/layout.tsx`) usa `swUrl="/serwist/sw.js"` y `reloadOnOnline={false}` para evitar recargas automáticas que pierdan estado no sincronizado.
- `clientsClaim: false` en `src/app/sw.ts` para evitar página en blanco con SSR streaming; documentado en el propio SW.
- Playwright tests usan `serviceWorkers: 'block'`.

### App Router Structure
- Protected pages live under `src/app/(app)/` (group route)
- Auth pages live under `src/app/(auth)/` (group route)
- Post-login redirect by role: `ADMIN`/`ASISTENTE` → `/dashboard`, `REPARTIDOR` → `/repartidor`, `CONTADOR` → `/reportes`

### Server Components
- `(app)/dashboard/page.tsx`, `(app)/reportes/page.tsx`, and `(app)/repartidor/page.tsx` are async Server Components
- Dashboard uses DDD module pattern: `src/modules/dashboard/` with domain/application/infrastructure/presentation layers
- `clientes`, `trabajadores`, `proveedores`, `insumos` use split pattern: SC page + Client Component
- SC pages pass serialized data via `JSON.parse(JSON.stringify(data))` to handle Prisma Decimal/Date types

### DDD Module Structure (Pilot: Dashboard)
- `src/modules/dashboard/` — First bounded context, serves as migration template
  - `domain/` — Entities, Value Objects, Domain Services (pure logic, no Prisma)
  - `application/` — Use cases (orchestrate repositories + domain services)
  - `infrastructure/` — Repositories (Prisma wrappers, return domain types)
  - `presentation/` — Adapter layer (DDD shape → legacy client shape)
  - `index.ts` — Composition root, exports `fetchDashboardData()`
- `src/shared/` — Cross-domain primitives
  - `domain/` — Money, DateRange, ProductCode (immutable value objects)
  - `infrastructure/` — Prisma client re-export
- `src/lib/dashboard-domain.ts` — Backward-compatible re-exports for existing code
- New bounded contexts should follow this same structure

### Cliente canónico `CONSUMIDOR_FINAL` (venta anónima)
- La app usa la **string literal `'CONSUMIDOR_FINAL'`** como id mágico para ventas sin cliente real (`VENTA_RAPIDA` y `VENTA_LIBRE`).
- 13+ lugares del código la usan como contrato fuerte (forms, validaciones, filtros, APIs). Cambiar el id requeriría refactor mayor; no es deuda técnica pendiente, es un contrato establecido.
- Se siembra en `prisma/seed.ts` y `prisma/seed-test.ts` con `activo: false` para **no aparecer en la lista de clientes** (todos los roles).
- `prisma/migrations/20260630_consolidate_consumidor_final/migration.sql` asegura el canónico y consolida duplicados legacy en producción.
- `CrearPedidoUseCase` implementa **lookup-or-create**: si el canónico no existe (entorno sin seed/migración), lo crea explícitamente con `id='CONSUMIDOR_FINAL'` (no genera CUID). Esto previene que cada venta anónima cree un cliente duplicado.
- Los filtros de `/clientes` y `/api/clientes` ocultan tanto el canónico (`activo=false`) como cualquier duplicado legacy CUID con `nombre='Consumidor Final' AND telefono=''` (defensa en profundidad).

## File Reference

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Local PostgreSQL (port 5433) + Redis 8 |
| `prisma/schema.prisma` | PostgreSQL schema (dev + prod) |
| `prisma/seed.ts` | Initial data seeding |
| `src/proxy.ts` | Auth redirect + rate limiting (replaces deprecated middleware.ts) |
| `src/lib/rate-limit.ts` | Rate limiter config (Redis + memory fallback) |
| `src/lib/sequence.ts` | PostgreSQL sequence generator |
| `src/lib/locks.ts` | Advisory locks |
| `src/lib/auth.ts` | NextAuth v5 configuration (JWT strategy) |
| `src/lib/dashboard-domain.ts` | Backward-compat re-exports for DDD dashboard |
| `src/lib/fetch-resilient.ts` | Offline-first fetch wrapper (10s timeout + Dexie enqueue) |
| `src/lib/db/sync.ts` | `syncWithServer()` — drains `requestQueue` + legacy `syncQueue` |
| `src/lib/db/offline.ts` | Dexie v4 with `requestQueue` table |
| `src/modules/dashboard/` | DDD pilot — domain/application/infrastructure/presentation |
| `src/shared/` | Cross-domain value objects (Money, DateRange, ProductCode) |
| `src/app/sw.ts` | Service worker generado por Serwist (PWA) |
| `src/app/serwist/[path]/route.ts` | Ruta dinámica que sirve el SW en `/serwist/sw.js` |
| `public/manifest.json` | Web App Manifest |
| `public/icons/` | Íconos PWA (incluye badge y Apple touch icon) |
| `public/screenshots/` | Screenshots del manifest para install prompts |
| `scripts/generate-pwa-icons.ts` | Generador de badge y Apple touch icon |
| `scripts/generate-pwa-screenshots.ts` | Generador de screenshots placeholder |
| `prisma/migrations/20260602_add_offline_id_fields/` | Production migration for offlineId dedup fields |
| `prisma/migrations/20260602_add_produccion_item/` | ProduccionItem model (Bloque 2: refactor per-product columns to items[]) |
| `prisma/migrations/20260603_add_produccion_offline_id/` | Produccion.offlineId for offline-first dedup (Bloque 5) |

## Post-Deployment Checklist

- [ ] `docker compose up -d` (or Supabase connected)
- [ ] `npx prisma db push` succeeds
- [ ] Seed data present (users, prices, config, products)
- [ ] Login works — dev credentials: `admin`/`admin123`, `asistente`/`asist123`, `contador`/`cont123`, `repartidor`/`rep123`
- [ ] `/dashboard` loads
- [ ] `/repartidor` loads (for `REPARTIDOR` role)
- [ ] `/api/realtime` responds with SSE stream when authenticated
- [ ] `REDIS_URL` is set and Redis is reachable in production
- [ ] `npx tsc --noEmit` passes
- [ ] `npx playwright test` passes

## Realtime Updates (multi-sesión)

Actualizaciones en vivo entre sesiones/usuarios para cambios en clientes, pedidos, embarques, pagos, gastos, compras y producción.

### Arquitectura

- **Redis Pub/Sub** para distribuir eventos entre instancias del servidor.
- **SSE (`/api/realtime`)** como conexión persistente autenticada con cookie de Auth.js.
- **Eventos pequeños**: `{ type, id, timestamp }`. El cliente recibe el aviso y hace refetch del recurso afectado.
- **Broadcast sin filtros de rol**: todos los usuarios reciben todos los eventos; cada pantalla decide si le interesa.

### Comportamiento del cliente

- `RealtimeProvider` mantiene **una sola** conexión SSE global.
- Se pausa al perder visibilidad de la pestaña (`document.hidden`).
- Se cierra (y no intenta conectar) en conexiones `2g` / `slow-2g` vía `navigator.connection.effectiveType`.
- Reconexión automática con backoff exponencial (1s → 30s).
- Heartbeat de 90s desde el servidor; si no llega, el cliente cierra y reconecta.

### Entidades y eventos publicados

| Recurso | Eventos |
|---------|---------|
| Cliente | `cliente.created`, `cliente.updated`, `cliente.deleted` |
| Pedido | `pedido.created`, `pedido.updated`, `pedido.deleted` |
| Embarque | `embarque.created`, `embarque.updated`, `embarque.deleted` |
| Pago | `pago.created` (emitido desde `/api/pedidos/pagar-fiado`) |
| Gasto | `gasto.created` |
| Compra | `compra.created` |
| Producción | `produccion.created` |

### Archivos relevantes

| File | Purpose |
|------|---------|
| `src/lib/realtime.ts` | Tipos, publicador Redis (`publishRealtimeEvent`) y validación de eventos. |
| `src/app/api/realtime/route.ts` | Endpoint SSE autenticado con heartbeat, suscripción Redis y cleanup. |
| `src/components/realtime-provider.tsx` | Proveedor global de EventSource, reconexión y pausa en background. |
| `src/hooks/use-realtime.ts` | Hook de contexto para acceder al estado de conexión. |
| `src/hooks/use-realtime-listener.ts` | Hook de suscripción con debounce 500ms. |
| `src/proxy.ts` | Excluye `/api/realtime` del rate limiting. |

### Requisitos de deployment

- Variable `REDIS_URL` configurada en producción (mismo Redis usado para rate limiting).
- En Vercel Hobby el endpoint SSE usa `maxDuration: 60` (límite de la plataforma); el cliente reconecta automáticamente.
- Si `REDIS_URL` no está configurado, `publishRealtimeEvent` es no-op y el endpoint retorna `503`, sin romper el resto de la app.

### Troubleshooting

- **El navegador no conecta**: revisar que la cookie de sesión esté presente (`/api/realtime` usa misma autenticación que el resto de la app).
- **Múltiples conexiones SSE**: verificar que solo haya un `RealtimeProvider` en el árbol (ya está en `src/app/(app)/layout.tsx`).
- **Hydration mismatch en `/repartidor`**: el indicador de conexión debe usar `useOnlineStatus()` (SSR-safe), no `navigator.onLine` directamente.
- **Tests E2E lentos/colgados**: `scripts/dev-with-lan.mjs` puede quedar pegado al puerto 3000; matar el proceso manualmente antes de re-correr Playwright.

## Known Issues

1. **Decimal fields**: Prisma returns `Prisma.Decimal` objects. Always cast with `Number(value)` when doing arithmetic.
2. **Next.js workspace inference**: With multiple `package-lock.json` files, Next.js may pick wrong root. `outputFileTracingRoot` set in `next.config.ts`.
3. **Serwist dependency**: `@serwist/next` está configurado y genera el SW en build. El SW manual `public/sw.js` ya no se usa; quedó como fallback histórico. Ver sección "Service Worker (PWA)".
4. **Auth adapter**: `@auth/prisma-adapter` is installed but auth uses JWT strategy (not database sessions).
5. **Redis v5 + rate-limiter-flexible**: Requires `useRedisPackage: true` (auto-detection fails because redis v5 constructor name is "Class", not "Commander").
6. **Docker Compose**: Redis 8 service added to `docker-compose.yml` on port 6379.
7. **NEXTAUTH_URL local vs LAN** (resuelto): La regla original era hardcodear `NEXTAUTH_URL="http://localhost:3000"` cuando se quería acceso desde localhost, o la IP LAN cuando se quería acceso LAN. **Solución mejor aplicada**: **dejar `NEXTAUTH_URL` sin setear en dev** y mantener `AUTH_TRUST_HOST=true`. Con esto Auth.js v5 detecta el host del request (`x-forwarded-host`/`host`) y soporta localhost y LAN simultáneamente sin hardcodear nada. Si por algún motivo se setea `NEXTAUTH_URL`, Auth.js usará ESE valor e ignorará el host real (ver `@auth/core/lib/utils/env.js:createActionURL`), causando que el login desde la IP distinta al valor de `NEXTAUTH_URL` falle con `CredentialsSignin` (porque el request interno fake va al host de NEXTAUTH_URL y la cookie no se aplica al browser real). En producción (Vercel) SÍ se debe setear al dominio público. Además, para destrabar el HMR desde LAN, configurar `NEXT_PUBLIC_DEV_LAN_ORIGIN` en `.env` con la IP LAN actual (separadas por coma si son varias). El `next.config.ts` lee esa variable y la pasa a `allowedDevOrigins`. Sin esta variable, el dev server solo acepta requests desde localhost.
8. **Test 291 ECONNRESET (Bloque 6)**: La falla reportada como "ECONNRESET" en `produccion.spec.ts:236` (`segundo registro mismo turno retorna 409`) tenía 3 causas encadenadas:
   - **a) Componente faltante**: `src/components/money-display.tsx` no estaba commiteado pero `dashboard-client/index.tsx` lo importa. Causaba que `/api/trabajadores` devolviera 500 (HTML de error de Next.js), lo que rompía el flujo del test.
   - **b) `CierreDia` con fechas futuras**: Filas de cierres con fechas > hoy hacían que `base-caja-modal.tsx` (líneas 60-73) redirigiera `/dashboard` a `/cierre?fecha=<next-unclosed>`. Fix: `DELETE FROM "CierreDia" WHERE fecha > NOW();`
   - **c) NEXTAUTH_URL se revierte**: Ver issue #7.
    - Tras arreglar (a) y (b), el test pasa consistentemente con `--workers=4` en 19-26s. Verificado en commit `eb37b14`.
9. **Errores TS fantasma en `.next/dev/types/validator.ts`** (resuelto): Si `npx tsc --noEmit` reporta errores inexplicables (módulos que sí existen, signatures que coinciden con el código fuente, identificadores que NO aparecen en el archivo), correr `rm -rf .next` y reintentar. Patrón observable: el error apunta a líneas/carácteres inexistentes en el archivo o a identificadores que no están en el código. El dev server (`next dev`) regenera `.next/dev/types/validator.ts` automáticamente y resuelve la inconsistencia. Si el dev server está corriendo, el cache se regenera al toque de archivo; si no está, el `rm -rf .next` fuerza la regeneración al próximo build.
10. **Bug teclado virtual tapa input en login (móvil)** (resuelto): En iOS Safari y Android Chrome pre-108 el teclado virtual subía y tapaba el input activo del login porque: (a) el wrapper usaba `flex items-center` con altura completa sin `overflow-y-auto`, así que el card no podía scrollear; (b) no había `scrollIntoView` en `onFocus`; (c) faltaba meta viewport con `width=device-width, initial-scale=1`. **Fix aplicado**:
    - `src/components/auth-shell.tsx` (nuevo): wrapper compartido con `min-h-[100dvh] flex items-center justify-center overflow-y-auto` + card con padding. Usado por login y cambiar-contraseña.
    - `src/app/(auth)/login/page.tsx` y `src/app/(app)/cambiar-contrasena/cambiar-contrasena-client.tsx`: `handleInputFocus` que hace `scrollIntoView({ block: 'center' })` + listener `visualViewport.resize` con `{ once: true }` para re-scrollear cuando el teclado termina de subir. Event-driven, sin `setTimeout` mágico.
    - `src/app/layout.tsx`: `Viewport` export ahora incluye `width: 'device-width'`, `initialScale: 1`, `interactiveWidget: 'resizes-content'` (Chrome 108+ Android lo respeta, iOS Safari lo ignora silenciosamente hasta que WebKit implemente la spec).
    - `enterKeyHint="next"` (username → password) y `enterKeyHint="go"`/`"done"` (último input) para UX mobile.
    - **Validación**: `e2e/auth-mobile-keyboard.spec.ts` con viewport iPhone 13 emulado, valida que el input activo queda visible tras focus y que el wrapper usa `dvh`. **Limitación**: Playwright no emula el OSK real de iOS Safari. Validación 100% real en device iOS/Android queda como tarea manual post-merge (no automatizable en CI sin device farm).
11. **CRUD de contactos desde la UI** (resuelto por `0d13fb3` + `2d3fd12` + `d3218b3` + `c0bd1b2` + `0b151dd`): La 1FN storage está cerrada (columnas JSON dropeadas, datos en `ContactoCliente` y `PlantillaProducto`).
    - Sub-endpoints creados en `d3218b3`, `2d3fd12` y `0b151dd`:
      - `POST /api/clientes/[id]/contactos` — crea un contacto. Devuelve 409 si ya existe uno con mismo (clienteId, telefono).
      - `PATCH /api/clientes/[id]/contactos/[contactoId]` (agregado en `2d3fd12`) — actualiza parcialmente. Todos los campos opcionales pero al menos uno requerido (validado con Zod `.refine()`). Devuelve 409 si el nuevo `telefono` choca con otro contacto del mismo cliente (unique constraint).
      - `DELETE /api/clientes/[id]/contactos/[contactoId]` — borra un contacto. Devuelve 404 si el contacto no pertenece al cliente (no leak info).
      - **Bug fix `0b151dd`**: `GET /api/clientes/[id]` ahora incluye `contactos: { orderBy: { nombre: 'asc' } }` en el `prisma.cliente.findUnique`. Antes faltaba, devolvía 500 al hidratar.
    - UI wireada en `0d13fb3` y extendida en `2d3fd12`: `cliente-form.tsx` ahora sincroniza los contactos via `syncContactos()` (diff por teléfono = unique key) después de cada POST/PUT exitoso. La función:
      - **POST nuevos** (teléfono no existe en server) → `POST /contactos`
      - **PATCH cambios** (mismo teléfono, distinto `nombre` o `relacion`) → `PATCH /contactos/[id]`
      - **DELETE borrados** (teléfono ya no en form) → `DELETE /contactos/[id]`
      - **Unchanged** (mismo teléfono, mismos campos) → skip
      - Dedup edge: en POST deduped (cliente ya existía), no sincroniza para evitar pisar contactos del cliente original.
    - Tests unitarios (32) en `c0bd1b2` y `2d3fd12` cubren: estructura de auth/role, validación Zod (incluyendo `.refine()` para "al menos un campo"), manejo de P2002/P2003, construcción dinámica del updateData, cross-cliente protection (no leak info), logAudit con `cambios` y `antes` (auditoría completa), orden auth-before-role.
    - ~~Mismo issue aplica a **productos de plantilla desde el form del cliente**: si la UI intenta editarlos, no persiste.~~ (Resuelto) **Productos de plantilla desde el form del cliente**: la sección "Recurrentes" del form (`cliente-form.tsx`) ahora muestra los productos con un link prominente "Editar productos en Pedidos Recurrentes →" (`data-testid="editar-productos-link"`) que lleva a `/recurrentes/[id]` donde SÍ persisten via `PUT /api/recurrentes`. **Decisión de diseño final (no es un follow-up pendiente)**: la edición desde el form del cliente NO se implementa ni se implementará. Los productos viven en `PlantillaProducto` con `@unique([plantillaId, producto])` (1FN storage, separados de `Cliente`) y se editan **exclusivamente** en su editor canónico. El form del cliente solo muestra el estado actual + un CTA al editor canónico. No crear sub-endpoints `POST/PATCH/DELETE /api/clientes/[id]/plantilla-productos` ni duplicar el editor acá — esa decisión ya está tomada y registrada.
12. **`prisma migrate deploy` falla en dev con `0_init already exists`** (resuelto): El dev DB fue inicializado con `prisma db push`, no con `migrate deploy`. Esto significa que la tabla `_prisma_migrations` está vacía aunque el schema (enums + tablas) ya existe en la DB. Si corrés `npx prisma migrate deploy` en dev, Prisma intenta aplicar `0_init` desde cero y falla con:
       ```
       P3018: Migration failed to apply
       Database error code: 42710
       ERROR: type "EstadoPedido" already exists
       ```
       **Workarounds**:
       - **Para verificar la nueva migración en dev** (caso normal): aplicar el SQL directo con `psql`:
         ```bash
         PGPASSWORD=bambu_dev psql -h localhost -p 5433 -U bambu -d bambu \
           -f prisma/migrations/<nombre>/migration.sql
         ```
         El SQL de cada migración nueva es idempotente (verificado en `20260611_grant_contacto_plantilla_app_write`).
       - **NO correr `migrate deploy` en dev** salvo que la DB haya sido wipeada. El flujo documentado usa `db push` (línea 64: `npx prisma db push`).
       - **En Supabase prod**: el schema se inicializa también vía `db push` (mismo comando), no vía `migrate deploy`. Si en algún momento se quiere usar `migrate deploy` (e.g. para CI/CD con migraciones versionadas), hay que poblar `_prisma_migrations` con `prisma migrate resolve --applied <nombre>` para cada migración ya en la DB. Documentado como follow-up si en el futuro se cambia el deploy flow.
       - **Síntoma típico**: alguien corre `prisma migrate deploy` esperando "aplicar las migraciones nuevas" y obtiene P3018. Es confuso porque la DB ya está al día. La causa es la separación entre "schema sync" (db push) y "migrations tracking" (migrate deploy). El proyecto usa el primero; el segundo no es la fuente de verdad.
 13. **Query params de `/pedidos` separados en filtros y triggers**:
     - **Filtros persistentes**: `clienteId`, `desde`, `hasta`, `search`, `tab`, `tipo`, `origen`, `estadoEntrega`, `estadoPago`. Estos params se aplican a la lista y se conservan en la URL para que el usuario no pierda el contexto al cerrar un modal o volver atrás.
     - **Trigger para nuevo pedido**: `?new=1&clienteId=ID` abre el modal de nuevo pedido con el cliente pre-seleccionado. También puede incluir `&negocioId=ID` para pre-seleccionar un negocio/sucursal. Después de abrir el formulario, los params `new`, `clienteId` y `negocioId` se limpian de la URL para que un refresh no reabra el formulario.
     - **Trigger para detalle**: `?openPedido=ID` abre el detalle del pedido. Se limpia tras abrir.
     - **Regla de diseño**: un query param no debe tener doble función (filtro + trigger). `clienteId` solo filtra; para abrir el formulario se usa explícitamente `new=1`. Esto permite que "Ver pedidos" desde el modal de negocio muestre la lista filtrada sin abrir el formulario, mientras que "Crear Pedido" abre el formulario con los datos pre-llenos.

---

13. **Session expiry UX: app congelada / "no permission" hasta F5** (resuelto): Cuando el JWT expiraba o era revocado server-side, el cliente no se enteraba hasta que el usuario recargaba, mostrando pantallas congeladas o errores de permiso. **Fix aplicado**:
    - `SessionProvider` hace polling cada 60s (`refetchInterval: 60`, `refetchOnWindowFocus`, `refetchWhenOffline: false`) para detectar invalidación server-side.
    - `fetchResilient` dispara el evento `app:auth:expired` ante 401/403 no relacionados con endpoints de Auth.js.
    - `SessionExpiryGuard` escucha el evento y redirige a `/login?reason=expired`, con debounce y prevención de doble redirect.
    - Login renderiza un banner ámbar "Tu sesión expiró" cuando `?reason=expired`.
    - `pedidos-client` verifica 401/403 también en fetches iniciales (`fetchClientes`, `fetchEmbarques`) y redirige si la sesión murió antes de montar el guard.
    - **Decisiones de scope**: no se purga la cola offline al expirar (`sync.ts` ya maneja 401 durante replay); no se refactorizan todos los `fetch` directos a `fetchResilient` en este ticket; no se implementa "smart polling" dinámico (se mantiene intervalo fijo simple).
     - **Validación**: `e2e/session-expiry.spec.ts` (8 tests, chromium + mobile), `src/components/__tests__/session-expiry-guard.test.tsx` (10 tests), `src/lib/__tests__/fetch-resilient-auth-error.test.ts` (6 tests).
14. **Navegación entre secciones lenta en producción (~60s por ruta)** (observación documentada): El test de producción `e2e/produccion-portal.spec.ts` midió ~60–63s para cargar `/clientes`, `/pedidos`, `/recurrentes` y `/embarques` desde cero en Vercel. Una vez cargada una ruta, las navegaciones posteriores dentro de la misma ruta son rápidas. La causa raíz es el cold-start de la función serverless de Vercel Hobby más el tiempo de renderizado SSR de cada página. **Fix aplicado**: ninguno a nivel de código (requeriría infraestructura: upgrade de plan, edge functions, o prefetching agresivo). **Mitigaciones aplicadas**: los P0/P1 de esta ronda (timeouts, polling fallback, touch targets) mejoran la percepción de UX cuando la red es lenta. Si el negocio prioriza velocidad de navegación, el siguiente paso es evaluar Vercel Pro, `export const dynamic = 'force-dynamic'` vs ISR, o migrar el SSR de listas a API calls desde client components con skeleton inmediato.
15. **Realtime `/api/realtime` 429 loop inflando costos Vercel + save cliente atascado en "Guardando..."** (resuelto):
    - **Causa raíz**: el servidor respondía 429 HTTP plano, que el cliente interpretaba como error genérico y reconectaba inmediatamente, generando un bucle de requests. El indicador de conectividad mostraba "Offline" cada vez que SSE no estaba abierto, y el guardado de clientes usaba un timeout de 15s que dejaba el botón bloqueado.
    - **Fix servidor** (`src/app/api/realtime/route.ts`, `src/lib/rate-limit.ts`): el límite de rate-limit para realtime es configurable por env (`REALTIME_RATE_LIMIT_*`) y al alcanzarlo el servidor devuelve un stream SSE 200 con evento `rate_limited` + `Connection: close` en lugar de 429 HTTP. `maxDuration` también es configurable vía `REALTIME_MAX_DURATION`.
    - **Fix cliente** (`src/components/realtime-provider.tsx`): listener para `rate_limited`, guard `rateLimitedUntilRef`, circuit breaker (3 eventos en 10min desactivan SSE por 5min), retry con jitter, dedup de errores, reconexión programada tras `retryAfter`, y fallback a polling. El timeout de conexión SSE se bajó a 8s.
    - **Fix indicador** (`src/components/connectivity-indicator.tsx`): ahora distingue `connecting` (ámbar) de `offline` (rojo); no muestra "Offline" si `navigator.onLine` es true pero SSE aún no conecta.
    - **Fix save cliente** (`src/app/(app)/clientes/clientes-client/index.tsx`): timeout de guardado reducido de 15s a 8s, y `setSaving(false)` explícito en branches timeout/offline/error para desbloquear el botón.
    - **Validación**: `src/components/__tests__/realtime-provider.test.tsx` (5 tests), `src/hooks/__tests__/use-realtime-listener.test.ts` (3 tests), suite completa Vitest 1972 tests pasan, `npx tsc --noEmit` pasa.

---

# Reglas de Código

- Tipado estricto. Sin `any`. Sin `// TODO` abandonados.
- Manejo de errores real (try/catch, logger), no `console.log("error")`.
- Sin inventar APIs, flags, métodos o sintaxis. Si no se está 100% seguro → buscar.
- Código funcional siempre. Preferir código sobre explicación.
- "Depende" solo si realmente depende → listar 2-3 ramas concretas.
- Si hay un bug en lo que se pide → señalarlo antes de implementar.

## Jerarquía de Fuentes

1. Docs oficiales (versión exacta en uso)
2. GitHub repo (Issues cerrados, PRs merged, CHANGELOG)
3. GitHub Issues/Discussions (workarounds probados)
4. Stack Overflow (alto score + aceptada)
5. Reddit / Hacker News (experiencia de campo)
6. Blog posts técnicos (solo con código funcional y fecha reciente)
7. **GPT/LLM previo — NUNCA.**

## Anti-patterns Prohibidos

- ❌ Inventar nombres de paquetes npm/pip.
- ❌ Suponer que un método existe porque "debería".
- ❌ Fabricar opciones de configuración por analogía.
- ❌ Dar números (benchmarks, límites) sin fuente.
- ❌ Asumir que el comportamiento de v(N-1) aplica a v(N).

## Formato de Respuesta

- Código: bloques con lenguaje marcado.
- Archivos nuevos: path completo en la primera línea.
- Cambios: indicar archivo + línea/función afectada.
- Múltiples archivos: orden de dependencia (base → derivado).

---

# Protocolo de Investigación (3 iteraciones del ciclo completo)

Cada iteración ejecuta 3 rondas. El resultado de la Iteración N alimenta la Iteración N+1.
Se ejecutan exactamente 3 iteraciones antes de presentar la solución final al usuario.

**Objetivo del protocolo**: Eliminar sesgos, ambigüedades e invenciones mediante validación cruzada iterativa. Cada ronda reduce la probabilidad de error.

## Iteración 1, 2, 3: Ciclo de 3 Rondas

### Ronda 1: Descubrimiento en la web
1. **Buscar en fuentes primarias**: docs oficiales del tool/lib (versión exacta en uso), GitHub repo, issues cerrados, PRs merged, CHANGELOG.
2. **Buscar en comunidades**: Stack Overflow (score alto + aceptada), Reddit (r/webdev, r/node, r/programming, subreddits específicos del tool), Hacker News.
3. **Identificar soluciones validadas**: listar 2-3 opciones que OTROS ya usaron en producción con casos similares.
4. **Documentar**: versión exacta, breaking changes, compatibilidad con el stack actual (Next.js 16, PostgreSQL, Auth.js v5, etc.).

### Ronda 2: Viabilidad y Planificación
1. **Analizar impacto**: ¿la solución rompe funcionalidades existentes? ¿requiere migración de datos? ¿hay conflictos con dependencias actuales?
2. **Evaluar riesgo**: ¿hay reportes de bugs o vulnerabilidades en la comunidad? ¿es considerada "hack" o deprecated?
3. **Armar plan**: lista de archivos a modificar, orden de dependencia (base → derivado), tests a escribir/ejecutar, criterios de éxito.
4. **Revisar con usuario**: presentar plan antes de ejecutar. Esperar aprobación explícita.

### Ronda 3: Verificación e Iteración
1. **Implementar plan aprobado**.
2. **Verificar**: correr tests (`npm run test`), type check (`npx tsc --noEmit`), validar contra criterios de éxito definidos en el plan.
3. **Si falla**: volver a Ronda 1 con el error/mensaje como nuevo input. No corregir a ciegas.
4. **Confirmar**: solo marcar como completo si hay evidencia (output de tests, log, screenshot). Si no hay evidencia → no afirmar que funciona.

## Reglas del Protocolo
- Ejecutar el ciclo completo (R1→R2→R3) exactamente **3 veces**.
- La **Iteración 2** toma el resultado de la Iteración 1 como input para nuevo descubrimiento.
- La **Iteración 3** toma el resultado de la Iteración 2 como input para refinamiento final.
- Si no hay fuente confiable → declarar: **"NO VERIFICADO — testear antes de usar"**.
- Si la solución es experimental → etiquetar: **"EXPERIMENTAL - HIGH RISK"**.
- NUNCA saltar directo a código sin completar las 3 iteraciones.
- NUNCA implementar sin aprobación del usuario tras cada Ronda 2.

