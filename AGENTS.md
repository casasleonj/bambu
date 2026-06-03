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

### Service Worker (PWA)
- `public/sw.js`: Network-first for navigation, cache-first for static assets
- APIs bypass cache entirely
- Playwright tests use `serviceWorkers: 'block'`

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
| `public/sw.js` | Manual service worker (PWA) |
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
- [ ] `npx tsc --noEmit` passes
- [ ] `npx playwright test` passes

## Known Issues

1. **Decimal fields**: Prisma returns `Prisma.Decimal` objects. Always cast with `Number(value)` when doing arithmetic.
2. **Next.js workspace inference**: With multiple `package-lock.json` files, Next.js may pick wrong root. `outputFileTracingRoot` set in `next.config.ts`.
3. **Serwist dependency**: `@serwist/next` is installed but not configured. The PWA uses the manual `public/sw.js` instead.
4. **Auth adapter**: `@auth/prisma-adapter` is installed but auth uses JWT strategy (not database sessions).
5. **Redis v5 + rate-limiter-flexible**: Requires `useRedisPackage: true` (auto-detection fails because redis v5 constructor name is "Class", not "Commander").
6. **Docker Compose**: Redis 8 service added to `docker-compose.yml` on port 6379.
7. **NEXTAUTH_URL local vs LAN**: En entornos Docker/container, el `.env` puede tener `NEXTAUTH_URL="http://192.168.x.x:3000"` (IP LAN hardcodeada). Si los e2e tests fallan con `TimeoutError: page.waitForURL` después de login (el browser navega a la IP LAN pero las cookies están en localhost), corregir a `NEXTAUTH_URL="http://localhost:3000"`. Playwright `baseURL` debe coincidir. `.env.example` documenta el valor correcto.

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

