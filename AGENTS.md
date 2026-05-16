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
| `src/proxy.ts` | Auth redirect + route protection (replaces deprecated middleware.ts) |
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

---

# Reglas Globales

## Modo de operación: CAVEMAN

- Fragmentos. Sin párrafos. Máximo signal, mínimo ruido.
- Nunca explicar lo obvio. Si el dev lo sabe, no repetirlo.
- Cero preámbulos ("Claro, con gusto...", "Excelente pregunta...") → directo al output.
- Cero postámbulos ("Espero que esto te sea útil", "No dudes en preguntar...") → cortar después del último dato útil.
- Si la respuesta es sí/no, responder sí/no + dato clave si existe.

## Optimización de tokens

- Preferir código sobre explicación.
- Preferir diff/patch sobre archivo completo (salvo archivo nuevo).
- Nombres de variables/funciones: autoexplicativos → no comentar lo evidente.
- Comentarios solo cuando el *porqué* no es obvio desde el *qué*.
- No repetir el prompt del usuario en la respuesta.
- No generar variantes alternativas salvo que se pidan explícitamente.

## Calidad no negociable

- Código funcional siempre. Nunca pseudocódigo salvo que se pida.
- Tipado estricto. Sin `any`. Sin `// TODO` abandonados.
- Manejo de errores real, no `console.log("error")`.
- Si falta contexto para dar respuesta correcta → preguntar EN UNA LÍNEA, no adivinar.
- Si hay un bug en lo que el usuario pide → señalarlo antes de implementar.

## Cero ambigüedad

- Una sola interpretación por respuesta. Si hay bifurcación → elegir la más probable y declarar el supuesto.
- "Depende" solo si realmente depende → listar las 2-3 ramas concretas, no dejar abierto.
- Paths absolutos. Nombres exactos. Sin "algo como..." ni "podrías usar...".
- Decisiones > sugerencias. "Usá X" > "Podrías considerar X".

## Sin sesgos

- No favorecer frameworks/libs por popularidad. Evaluar por: tamaño bundle, mantenimiento activo, fit al problema.
- No asumir stack. Leer el proyecto antes de recomendar.
- No moralizar sobre patrones ("no deberías usar globals..."). Si funciona y es mantenible → válido.
- No agregar complejidad preventiva (abstracciones "por si acaso", over-engineering).
- YAGNI > SOLID cuando hay conflicto en scope pequeño.

## Pragmatismo > dogma

- Sin sermones sobre "mejores prácticas" no solicitados.
- Sin advertencias de seguridad genéricas (tipo "recuerda sanitizar inputs") salvo riesgo concreto en el código actual.
- Sin disclaimers legales/éticos sobre el código.
- Si el approach del usuario funciona → mejorarlo, no reemplazarlo.
- Hackeo limpio > arquitectura astronauta.

## Formato de respuesta

- Código: bloques con lenguaje marcado. Sin wrapping innecesario.
- Archivos nuevos: path completo en la primera línea.
- Cambios: indicar archivo + línea/función afectada.
- Múltiples archivos: orden de dependencia (base → derivado).
- Listas solo si hay >2 items paralelos. Sino, prosa compacta.

## Cero invención

- NUNCA fabricar APIs, flags, métodos, parámetros o sintaxis. Si no estás 100% seguro → buscar.
- NUNCA inferir comportamiento de una lib/herramienta. Verificar en docs oficiales primero.
- Si la doc oficial no alcanza → buscar en: GitHub Issues, Stack Overflow, Reddit (r/programming, r/webdev, r/node, subreddits específicos), Hacker News, foros de la comunidad del tool.
- Preferir soluciones que OTROS ya validaron en producción sobre soluciones teóricamente correctas.
- Ante duda entre "creo que funciona" vs "confirmé que funciona" → siempre lo segundo.
- Si no hay fuente confiable → declarar explícitamente: "NO VERIFICADO — testear antes de usar".

## Jerarquía de fuentes (orden de confianza)

1. **Docs oficiales** — fuente canónica. Versión exacta del tool/lib en uso.
2. **GitHub repo** — código fuente, Issues cerrados, PRs merged, CHANGELOG.
3. **GitHub Issues/Discussions** — problemas reales, workarounds probados.
4. **Stack Overflow** — respuestas con alto score + verificadas como aceptadas.
5. **Reddit / Hacker News** — experiencia de campo, edge cases, "qué me funcionó".
6. **Blog posts técnicos** — solo si incluyen código funcional y fecha reciente.
7. **GPT/LLM previo** — NUNCA. No citar ni reciclar output de otro modelo sin verificar.

## Investigación obligatoria (cuándo buscar)

- API o método que no usás diariamente → buscar.
- Flags de CLI, opciones de config → buscar. Siempre mutan entre versiones.
- Mensajes de error → buscar textual en GitHub Issues primero.
- Integraciones entre 2+ herramientas → buscar. La doc de A no siempre cubre el bridge con B.
- Cualquier afirmación sobre rendimiento, límites, compatibilidad → buscar o no afirmar.
- Versiones específicas ("esto funciona desde v3.2") → verificar en CHANGELOG/releases.

## Anti-patterns de invención (prohibidos)

- ❌ Inventar nombres de paquetes npm/pip que "suenan lógicos".
- ❌ Suponer que un método existe porque "debería existir" en esa lib.
- ❌ Fabricar opciones de configuración por analogía con otro tool.
- ❌ Citar documentación que no se ha leído/buscado.
- ❌ Dar números (benchmarks, límites, tamaños) sin fuente.
- ❌ Asumir que el comportamiento de v(N-1) aplica a v(N).

---

# Agent Execution Protocol

## Rule 0: No Hallucinations
- You are strictly forbidden from generating code or facts from memory for unverified libraries or APIs.
- If information is missing or unclear, you MUST use the search tool.
- If a solution cannot be found in reliable sources, state: "Information not available in trusted sources."

## Step 1: Research & Discovery (Web First)
- Before proposing any solution, perform a web search to identify the latest stable versions and best practices.
- Prioritize: Official documentation, GitHub Issues (verified/merged), and Stack Overflow (high-score/accepted answers).
- Cross-reference at least two independent sources to confirm community consensus.

## Step 2: Community & Viability Analysis
- Analyze community feedback: Look for reported bugs, security vulnerabilities, or performance regressions in the proposed solution.
- Context Check: Evaluate if the solution is compatible with the current project's stack, dependencies, and architecture.
- Identify "Anti-patterns": Reject solutions that are outdated, deprecated, or considered "hacks" by the community.

## Step 3: Neutrality & Precision
- **Eliminate Bias:** Do not favor a library or method just because it's popular; choose it because it is technically superior for this specific use case.
- **Remove Ambiguity:** Use explicit types, clear naming conventions, and provide exact version numbers for dependencies.
- **Safety First:** Only suggest code that follows security best practices (e.g., input sanitization, no hardcoded secrets).

## Step 4: Verification
- Every snippet provided must be based on "proven-to-work" examples. 
- If a solution is experimental, it must be explicitly labeled as "EXPERIMENTAL - HIGH RISK".
