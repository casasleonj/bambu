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
- Playwright (E2E tests)
- Vitest (unit tests)

## Database

**ONE schema, ONE provider: PostgreSQL everywhere.**

- Local dev: PostgreSQL via Docker Compose (`docker compose up -d`)
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

### Rate Limiting
- `rate-limiter-flexible` with Redis support (falls back to in-memory in dev)
- Auth limit: 10 req/15min in production, 1000 req/min in development
- API limit: 300 req/min
- Page limit: 600 req/min

### Service Worker (PWA)
- `public/sw.js`: Network-first for navigation, cache-first for static assets
- APIs bypass cache entirely
- Playwright tests use `serviceWorkers: 'block'`

### Server Components
- `dashboard/page.tsx` and `reportes/page.tsx` are async Server Components (direct Prisma queries)
- `clientes`, `trabajadores`, `proveedores`, `insumos` use split pattern: SC page + Client Component
- SC pages pass serialized data via `JSON.parse(JSON.stringify(data))` to handle Prisma Decimal/Date types

## File Reference

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Local PostgreSQL |
| `prisma/schema.prisma` | PostgreSQL schema (dev + prod) |
| `prisma/seed.ts` | Initial data seeding |
| `src/middleware.ts` | Auth + rate limiting |
| `src/lib/rate-limit.ts` | Rate limiter (Redis + fallback) |
| `src/lib/sequence.ts` | PostgreSQL sequence generator |
| `src/lib/locks.ts` | Advisory locks |
| `public/sw.js` | Service worker |
| `e2e/` | Playwright E2E tests |

## Post-Deployment Checklist

- [ ] `docker compose up -d` (or Supabase connected)
- [ ] `npx prisma db push` succeeds
- [ ] Seed data present (users, prices, config)
- [ ] Login works (admin/admin123)
- [ ] Dashboard loads
- [ ] `npx tsc --noEmit` passes
- [ ] `npx playwright test` passes

## Known Issues

1. **Decimal fields**: Prisma returns `Prisma.Decimal` objects. Always cast with `Number(value)` when doing arithmetic.
2. **Next.js workspace inference**: With multiple `package-lock.json` files, Next.js may pick wrong root. `outputFileTracingRoot` set in `next.config.ts`.
