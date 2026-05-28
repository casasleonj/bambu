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
- Next.js 16 (App Router)
- NextAuth v5 (Auth.js)
- Prisma ORM + **PostgreSQL** (dev and production)
- Tailwind CSS v4 + shadcn/ui
- Dexie (offline-first IndexedDB)
- Zustand (client state)
- Sonner (toasts)
- Playwright (E2E tests)
- Vitest (unit tests)
- ESLint v9 (flat config)

## Database

**ONE schema, ONE provider: PostgreSQL everywhere.**

- Local dev: PostgreSQL 16 Alpine via Docker Compose on port **5433** (`docker compose up -d`)
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
- Dev: Docker Compose PostgreSQL 16 Alpine (`docker compose up -d`)
- Prod: Supabase. Same schema, same provider, zero drift.
- Advisory locks (`pg_advisory_lock`) for sequence generation
- `Decimal` fields for all monetary values (precision matters)

### Proxy (formerly Middleware)
- Next.js 16 deprecated `middleware.ts` and renamed it to `proxy.ts`.
- `src/proxy.ts` runs on the Node.js runtime before routes are rendered.
- It redirects unauthenticated requests to `/login` (with `callbackUrl`), preserving the original path for post-login redirect.
- It does NOT duplicate rate limiting — that remains inside API routes via `rate-limiter-flexible`.

### Rate Limiting
- `rate-limiter-flexible` with Redis support (falls back to in-memory in dev)
- Auth limit: 10 req/15min in production, 1000 req/min in development
- API limit: 300 req/min
- Page limit: 600 req/min

### Service Worker (PWA)
- `public/sw.js`: Network-first for navigation, cache-first for static assets
- APIs bypass cache entirely
- Playwright tests use `serviceWorkers: 'block'`

### App Router Structure
- Protected pages live under `src/app/(app)/` (group route)
- Auth pages live under `src/app/(auth)/` (group route)
- Post-login redirect by role: `ADMIN`/`ASISTENTE` → `/dashboard`, `REPARTIDOR` → `/repartidor`, `CONTADOR` → `/reportes`

### Server Components
- `(app)/dashboard/page.tsx`, `(app)/reportes/page.tsx`, and `(app)/repartidor/page.tsx` are async Server Components (direct Prisma queries)
- `clientes`, `trabajadores`, `proveedores`, `insumos` use split pattern: SC page + Client Component
- SC pages pass serialized data via `JSON.parse(JSON.stringify(data))` to handle Prisma Decimal/Date types

## File Reference

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Local PostgreSQL (port 5433) |
| `prisma/schema.prisma` | PostgreSQL schema (dev + prod) |
| `prisma/seed.ts` | Initial data seeding |
| `src/proxy.ts` | Auth redirect + route protection (replaces deprecated middleware.ts) |
| `src/lib/rate-limit.ts` | Rate limiter (Redis + fallback) |
| `src/lib/sequence.ts` | PostgreSQL sequence generator |
| `src/lib/locks.ts` | Advisory locks |
| `src/lib/auth.ts` | NextAuth v5 configuration (JWT strategy) |
| `public/sw.js` | Manual service worker (PWA) |

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

