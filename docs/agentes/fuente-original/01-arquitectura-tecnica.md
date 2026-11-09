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
- Serwist 9.5.12 (PWA service worker)

**ALL dependency versions are pinned (no `^` or `~`).** — Violación encontrada en la auditoría del 2026-10-10 (`serwist`/`@serwist/next`/`@vitest/coverage-v8` con `^`) y ya **corregida en PR #284** (`fix(repo): higiene — .env.example faltante y versiones sin pin en package.json`).

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

### Consulta de entregas parciales y deuda (#656 / #631 / #673)

La presentación mínima aprobada conserva el importe comercial del pedido y distingue entregado, pendiente de entrega y exigible. Para consultar deuda usar `leerExigibles`, también en filtros y totales antes de paginar; no usar el saldo comercial como deuda de una parcial. Cierre y Dashboard comparten `valorEntregadoPedidoCentavos`. El cumplimiento/deuda es el actual de los pedidos seleccionados por su fecha; no una reconstrucción al cierre de una fecha pasada. Los cierres consolidados conservan su snapshot original. Sin evidencia exigible en una parcial se advierte «Por conciliar», sin inventar hechos ni afirmar deuda cero. Detalles y transición: `docs/fiados/656-658-entrega.md`. Conservar entrega directa, planificación secundaria y cobro FIFO.

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
- API limit: 300 req/min (applies to all `/api/*` except `/api/health`, `/api/cron/*`, `/api/realtime`).
- Realtime limit: configurable via `REALTIME_RATE_LIMIT_*`; default 6 connections/min per user; applied by `/api/realtime` itself.
- Auth endpoints (`/api/auth/*`) are handled by Auth.js's own protections; the proxy matcher excludes them.
- Page routes are not rate-limited; scale is 6 users and the proxy only enforces auth/role checks.
- Excluded paths: `/api/health`, `/api/cron/*`, `/api/realtime`.
- Key config: `useRedisPackage: true` (required for redis v5), `disableOfflineQueue: true`, `insuranceLimiter` (memory fallback), `inMemoryBlockOnConsumed` (7x faster after limit reached).
- **Auth-before-rate-limit**: `src/proxy.ts` rejects unauthenticated `/api/*` requests (401) before calling `checkRateLimit()`. This prevents bot/scanner traffic from consuming the Redis command budget before the route handler's own `requireAuth()` is reached.

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
  - **Crear pedido: la clave es por BORRADOR, no por envío** (plan de integridad v1.2 §5.B, incidente #285/#286). `PedidosWorkspace` y `PedidoFormUnified` generan la clave al montarse (cada apertura del modal es un borrador nuevo) y la reusan en cada reintento; `useCrearPedido` la usa si viene en `payload.offlineId`. Si el guardado falla, el workspace sale de `COMMITTING` (`COMMIT_ERROR`) para reintentar el mismo borrador en vez de obligar a abrir uno nuevo. Una respuesta `deduped` se muestra como "Esta venta ya estaba registrada (#N)".
  - `Pedido.offlineId` (@unique) — POST `/api/pedidos`, `/api/pedidos/[id]/anular`, `/entrega`, `/enviar`
  - `Pago.offlineId` (indexed, NOT unique) — POST `/api/pedidos/pagar-fiado` (rebuilds `pagosAplicados` summary from existing Pagos with same offlineId)
  - **Cobro de UN pedido entregado hoy (#597)**: `POST/GET /api/pedidos/pagar-fiado` aceptan `pedidoId` opcional y cobran solo ese pedido. El servidor (`errorCobroPedido`, `fiados-cobro-server.ts`) lo permite únicamente si: es de un cliente real, está entregado con saldo, **se entregó hoy en Bogotá** (`entregadoAt`; si no existe, la fecha del pedido), no se vendió fiado a propósito (`promesaPagoFecha`) y el cliente **no tiene otra deuda que el reparto por antigüedad pagaría antes** (así el dinero nunca va al pedido equivocado). Si no, responde 409 (`PEDIDO_NO_ES_DEL_DIA`, `PEDIDO_VENDIDO_FIADO`, `CLIENTE_CON_DEUDA_ANTERIOR`) y el diálogo ofrece «Ir a Fiados». Nunca genera saldo a favor (400 `MONTO_EXCEDE_PEDIDO`). Sin `pedidoId` el cobro de Fiados no cambia (del más antiguo al más reciente; misma `versionDeuda`). La lista ofrece «Registrar pago» o «Cobrar en Fiados» según `derive-operacion.ts`. Pendiente: acción de cobro en el modal de detalle (`derive-detalle.ts`).
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
- Serwist 9.5.12 genera el service worker en build a partir de `src/app/sw.ts`.
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
- `(app)/dashboard/page.tsx`, `(app)/reportes/page.tsx`, `(app)/reportes/ventas/page.tsx`, and `(app)/repartidor/page.tsx` are async Server Components
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

### Coordenadas efectivas del pedido (geo)
- **Regla ÚNICA de resolución**: `pickCoords()` en `src/lib/geo/pedido-coords.ts`. **Si el `Negocio` tiene coords válidas, ganan; si no, las del `Cliente`.** Contrato documentado en `schema.prisma` (modelo `Negocio`). `null` si ninguna fuente tiene coords.
- **Guard crítico**: `Number(null) === 0` → coords `(0,0)` (Golfo de Guinea). Las fuentes sin coords (`null`/`undefined`) se saltan ANTES del cast; solo pasan `Number` los valores no-null y se valida `isFinite`.
- **5 consumidores alineados** (no deben divergir):
  1. SSR repartidor (`repartidor/page.tsx`) → expone `lat`/`lng` top-level por pedido (efectivas) + `cliente.lat/lng` (fuente).
  2. `GET /api/pedidos` → `lat`/`lng` top-level por pedido (efectivas).
  3. SSR `/pedidos` (`pedidos/page.tsx`) → `lat`/`lng` top-level (efectivas).
  4. TSP (`optimize-ruta.ts`) → usa `pickCoords(p)` para los waypoints de optimización de orden.
  5. Validación GPS (`pedidos-client/index.tsx`) → `pedidoParaEntregar.lat ?? cliente.lat` (payload efectivo con fallback legacy).
- **Payload**: `Pedido.lat/lng` en `pedidos-client/types.ts` son opcionales (`null` si no hay fuente) para compat con payloads legacy.
- **Backfill de negocios**: `POST /api/negocios/[id]/geocode` → `backfillNegocioCoords()` (`src/lib/geo/backfill-negocio-coords.ts`). Prioridad: `linkUbicacion` parseado (incluye short URLs expandidas) → mediana de `Pedido.gpsLat/gpsLng` confirmados con ese `negocioId`. `Negocio` NO tiene columnas `geocodeOrigen`/`geocodeAt` (decisión: evitar migración); la procedencia se audita vía `logAudit` en el caller.
- **Short URLs**: `src/lib/geo/expand-short-maps-url.ts` (server-only, extraído de `/api/geo/expand-maps`) resuelve `maps.app.goo.gl` / `goo.gl/maps` vía cadena de redirects. Seguridad SSRF: allowlist de hosts Google (`maps.app.goo.gl`, `goo.gl`, `www.google.com`, `google.com`, `maps.google.com`), tope 5 redirects, timeout 8s. Compartido por el endpoint y los backfills de cliente/negocio.
- **UI**: `negocio-detail-modal.tsx` muestra "Coords internas" (data-testid `coords-internas-negocio`) con botón "Actualizar coordenadas" (`btn-geocode-negocio`, solo edición) que llama al endpoint y propaga vía `onGeocoded` → `handleNegocioGeocoded` en `clientes-client`. `negocio-form.tsx` incluye `CoordsPreview` para feedback client-side del link.
- **Tests**: `src/lib/geo/__tests__/pedido-coords.test.ts`, `expand-short-maps-url.test.ts`, `backfill-negocio-coords.test.ts`, `optimize-ruta.test.ts`, `src/app/api/negocios/[id]/geocode/__tests__/route.test.ts`.

## File Reference

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Local PostgreSQL (port 5433) + Redis 8 |
| `prisma/schema.prisma` | PostgreSQL schema (dev + prod) |
| `prisma/seed.ts` | Initial data seeding |
| `src/proxy.ts` | Auth redirect + rate limiting (replaces deprecated middleware.ts) |
| `src/lib/rate-limit.ts` | Rate limiter config (Redis + memory fallback) |
| `src/lib/dates.ts` | Helpers timezone-aware Bogotá: `getTodayString`, `startOfDayBogota`, `endOfDayBogota`, `buildDateRangeFilter`, `parseDateParam` |
| `src/lib/sequence.ts` | PostgreSQL sequence generator |
| `src/lib/locks.ts` | Advisory locks |
| `src/lib/auth.ts` | NextAuth v5 configuration (JWT strategy) |
| `src/lib/dashboard-domain.ts` | Backward-compat re-exports for DDD dashboard |
| `src/lib/fetch-resilient.ts` | Offline-first fetch wrapper (10s timeout + Dexie enqueue) |
| `src/lib/db/sync.ts` | `syncWithServer()` — drains `requestQueue` + legacy `syncQueue` |
| `src/lib/db/offline.ts` | Dexie v4 with `requestQueue` table |
| `src/lib/geo/pedido-coords.ts` | Regla única de coords efectivas del pedido (`pickCoords`: negocio gana, fallback cliente) |
| `src/lib/geo/expand-short-maps-url.ts` | Expansión server-only de short URLs de Maps (allowlist SSRF, tope redirects, timeout) |
| `src/lib/geo/backfill-negocio-coords.ts` | Backfill de coords de negocio (linkUbicacion parseado → mediana GPS historial) |
| `docs/trabajadores/DEUDA_PENDIENTE.md` | Deuda pendiente del trabajador (#566): qué cuenta como deuda, `DeudaTrabajador.pedidoId`, quién la ve (ADMIN/ASISTENTE/CONTADOR todas; el resto la suya en Mi perfil), insignia clicable en la tarjeta y la ruta `GET /api/trabajadores/[id]/deudas-pendientes` |
| `src/lib/integridad/` | Verificador de integridad de solo lectura (reglas V1–V16 en una transacción READ ONLY; V16 = comisión del repartidor pagada de la caja cuadra con el cierre y con la nómina, #499; V14 = pago de regularización contado en la caja de su fecha de registro, #402). Expuesto en `GET /api/integridad` (ADMIN) y `npx tsx scripts/verificar-integridad.ts [--json]`. No escribe, no notifica, no corrige |
| `docs/pedidos/GESTION_TEMPORAL_SIN_EMBARQUE.md` | **TEMPORAL (#472)**: el ADMIN registra entregas y cobros sin embarque (interruptor `Config.GESTION_ADMIN_SIN_EMBARQUE`, apagado por defecto). Qué hace, cómo activarla y la lista para retirarla cuando Embarques funcione |
| `docs/nomina/COMISION_REPARTIDOR_DIA.md` | Comisión del repartidor por día (#499): cálculo único, pago desde la interfaz (`POST /api/nomina/dia/pagar`), cierre de caja automático y descuento en la nómina del período |
| `src/app/api/negocios/[id]/geocode/route.ts` | Endpoint de geocode de negocio (usado por el botón "Actualizar coordenadas") |
| `src/app/(app)/clientes/clientes-client/panel-prefetch.ts` | Caché TTL 60s/LRU 20 + prefetch de stats/historial del panel de cliente (fetch plano, nunca fetchResilient; invalidación vía realtime pedido.*/pago.*/embarque.*) |
| `src/modules/dashboard/` | DDD pilot — domain/application/infrastructure/presentation |
| `src/shared/` | Cross-domain value objects (Money, DateRange, ProductCode) |
| `src/app/sw.ts` | Service worker generado por Serwist (PWA) |
| `src/app/(app)/reportes/ventas/page.tsx` | Server Component de reporte de ventas detallado (productos, métodos de pago, tabla paginada) |
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
| Pedido | `pedido.created`, `pedido.updated` |
| Embarque | `embarque.created`, `embarque.updated`, `embarque.deleted` |
| Pago | `pago.created` (emitido desde `/api/pedidos/pagar-fiado`) |
| Gasto | `gasto.created` |
| Compra | `compra.created` |
| Producción | `produccion.created` |
| Trabajador | `trabajador.created`, `trabajador.updated`, `trabajador.deleted` |
| Config | `config.updated` |
| Plan de distribución | `route_plan.updated` (`id` = fecha `YYYY-MM-DD`; emitido al generar/confirmar/replanificar/override/cancelar un `PlanDia`) |

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
- El endpoint SSE usa `maxDuration: 300` (límite de Vercel Pro; Hobby lo capa automáticamente a 60s); el cliente reconecta automáticamente.
- Si `REDIS_URL` no está configurado, `publishRealtimeEvent` es no-op y el endpoint retorna `503`, sin romper el resto de la app.

### Troubleshooting

- **El navegador no conecta**: revisar que la cookie de sesión esté presente (`/api/realtime` usa misma autenticación que el resto de la app).
- **Múltiples conexiones SSE**: verificar que solo haya un `RealtimeProvider` en el árbol (ya está en `src/app/(app)/layout.tsx`).
- **Hydration mismatch en `/repartidor`**: el indicador de conexión debe usar `useOnlineStatus()` (SSR-safe), no `navigator.onLine` directamente.
- **Tests E2E lentos/colgados**: `scripts/dev-with-lan.mjs` puede quedar pegado al puerto 3000; matar el proceso manualmente antes de re-correr Playwright.

