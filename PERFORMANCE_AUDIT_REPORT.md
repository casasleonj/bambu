# Performance Audit Report — Agua Bambu v2

**Date**: 2026-05-04 | **Auditor**: Performance Engineer + Web Vitals Specialist

---

## Resumen Ejecutivo

**Una app con arquitectura Next.js 16 moderna (App Router, SC/CC split, Turbopack, streaming) pero con 3 cuellos de botella principales: el dashboard hace 11 queries Prisma secuenciales, el AppShell es un Client Component que baja todo el JS del sidebar en cada página, y hay 48 Client Components donde ~12 podrían ser Server Components sin perder interactividad.** El bundle inicial es ligero (~80-120 KB gzipped estimado) porque Tailwind v4 + Turbopack tree-shakean bien, pero el dashboard tiene TTFB de ~400-800ms en dev por las queries encadenadas.

**Estado de performance**: Funcional para 6 usuarios en LAN/WiFi. Penaliza en 2G/3G rural colombiano (target declarado del proyecto).

**Bottleneck principal**: Backend (dashboard queries) + Frontend (SC/CC ratio)

---

## Paso 0 — Diagnóstico Rápido

**Tipo de bottleneck principal:**

- ☑ Carga inicial (Bundle + Critical Path) — medio
- ☑ Runtime / Interactividad (Main thread, renders) — bajo
- ☑ **Backend / API response time** — alto
- ☑ **Base de datos** — alto (dashboard)
- ☑ Network / Waterfall / Payloads — medio

**Métricas baseline estimadas:**

| Métrica | Valor estimado | Target 2026 | Prioridad |
|---------|---------------|-------------|-----------|
| Initial Bundle (gzip) | ~80-120 KB | <120 KB | Media |
| LCP | ~2-4s (dashboard) | <2.2s | Alta |
| INP | <50ms | <150ms | Baja |
| CLS | <0.01 | <0.05 | Baja |
| TTFB | ~400-800ms (dashboard dev) | <150ms | Alta |
| API p95 GET | ~100-400ms | <200ms | Alta |
| Queries por página crítica | 11 (dashboard) | ≤5 | Alta |
| DOM Nodes | ~500-800 | <1,800 | Baja |

---

## Score Ponderado

| Dimensión | Peso | Score /10 |
|-----------|------|-----------|
| Bundle & Carga Inicial | 25% | 7/10 |
| Runtime / Interactividad | 20% | 7/10 |
| API Response Time | 20% | 5/10 |
| Base de Datos | 15% | 5/10 |
| Caching | 10% | 3/10 |
| Network Efficiency | 5% | 7/10 |
| Build & DX | 5% | 8/10 |
| **TOTAL** | 100% | **6.0/10** |

---

## Paso 1 — Frontend: Bundle y Carga Inicial

### 1.1 Dependencies Audit

| Dependencia | Tamaño estimado (gzip) | Necesaria | Alternativa |
|-------------|------------------------|-----------|-------------|
| `next` 16.2.4 + `react` 19.2.4 | ~45 KB | Sí | — |
| `@prisma/client` | server-only (0 KB client) | Sí | — |
| `sonner` 2.0.7 | ~3 KB | Sí | — |
| `zustand` 5.0.12 | ~1.5 KB | Sí | — |
| `tailwind-merge` 3.5.0 | ~2 KB | Sí | — |
| `clsx` 2.1.1 | ~0.5 KB | Sí | — |
| `dexie` 4.4.2 | ~15 KB | Parcial | Solo para offline-first, usado en IndexedDB |
| `zod` 4.3.6 | ~6 KB (tree-shaken) | Sí | — |
| `uuid` 14.0.0 | ~3 KB | **No** | `crypto.randomUUID()` es nativo en 2026 |
| `bcryptjs` 3.0.3 | ~9 KB | Sí (auth server) | — |
| `rate-limiter-flexible` + `redis` | server-only | Sí | — |
| `workbox-*` 5 packages | ~15 KB | **Quizás no** | `@serwist/next` ya maneja SW |
| `@serwist/next` | ~8 KB | Sí | — |
| **shadcn/ui components** | ~2-5 KB cada uno | Parcial | Algunos solo se usan en 1 página |

### 1.2 Code Splitting

Solo 2 componentes usan `dynamic()` con `{ ssr: false }`:
- `PedidoForm` (308 líneas) — `src/app/(app)/pedidos/pedidos-client/index.tsx:13`
- `VentaRapidaForm` (371 líneas) — `src/app/(app)/pedidos/pedidos-client/index.tsx:14`

**Candidatos a lazy loading adicional:**

| Componente | Archivo | Líneas | Cuándo se necesita | Ahorro estimado |
|------------|---------|--------|-------------------|-----------------|
| `ClienteForm` | `cliente-form.tsx` | 275L | Solo al abrir modal crear/editar | ~12 KB |
| `ClienteTable` | `cliente-table.tsx` | ~250L | Siempre visible | No lazy |
| `PedidoTable` | `pedido-table.tsx` | 261L | Siempre visible | No lazy |
| `PedidoFilters` | `pedido-filters.tsx` | ~50L | Siempre visible | No lazy |
| `EmbarqueDetailModal` | `embarque-detail-modal.tsx` | 288L | Solo al clickear card | ~15 KB |
| `EmbarqueCreateModal` | `embarque-create-modal.tsx` | ~130L | Solo al clickear botón | ~7 KB |
| `PedidoCuadre` (cerrar) | `pedido-cuadre.tsx` | 242L | Solo en página cerrar | ~10 KB |
| `BaseCajaModal` | `base-caja-modal.tsx` | 128L | Solo primer login del día | ~6 KB |
| `UpdateNotification` | `update-notification.tsx` | ~30L | Cada carga | Pequeño |

**Recomendación**: Lazy-load al menos `BaseCajaModal`, `UpdateNotification`, y los modales de formulario. El `BaseCajaModal` bloquea el render inicial de TODAS las páginas (`src/app/(app)/layout.tsx:13`).

### 1.3 Images y Assets

**Problema**: `images.unoptimized: true` en `next.config.ts:7`. Esto desactiva `next/image` completamente. Para un ERP sin imágenes de producto, es correcto. Pero significa que los íconos/manifest icons no están optimizados.

El proyecto no usa imágenes en la UI — todos los íconos son **emoji inline** (`🍶`, `🧊`, `🏭`, etc.). Esto es **excelente para performance**: 0 requests de imagen, 0 CLS por imágenes, render inmediato.

### 1.4 Critical Rendering Path

- Layout usa `<html lang="es">` + `antialiased` class. Sin Google Fonts bloqueantes ✅
- `globals.css` es Tailwind v4 con `@import "tailwindcss"` — CSS mínimo (~8-15 KB gzipped final)
- No hay `preload` ni `preconnect` configurados 
- CSP con nonce fuerza re-generación por request — overhead mínimo (~1ms)

---

## Paso 2 — Frontend: Runtime Performance

### 2.1 Client vs Server Components

| Total archivos TSX en `src/app/(app)/` | ~80 |
|----------------------------------------|-----|
| `'use client'` | **48 (60%)** |
| Server Components | ~32 (40%) |

**Problema**: 48 Client Components es excesivo para un ERP. Muchos no usan `useState`, `useEffect`, `onClick`, o browser APIs.

**Candidatos a migrar a Server Component:**

| Archivo | ¿Usa hooks? | ¿Usa browser APIs? | Migrable |
|---------|------------|-------------------|----------|
| `app-shell.tsx` (header) | No (solo Link) | No | ✅ — usar `<Link>` en SC |
| `connectivity-indicator.tsx` | No | No | ✅ — usar `<noscript>` |
| `update-notification.tsx` | Sí | `navigator` | ❌ |
| `base-caja-modal.tsx` | Sí | `localStorage` | ❌ |
| `pedido-filters.tsx` | No | No | ✅ |
| Tarjetas de resumen | No | No | ✅ |

**Recomendación**: Migrar 10-12 componentes a Server Components. `app-shell.tsx` es el más impactante porque está en TODAS las páginas y actualmente es un Client Component que baja el sidebar completo.

### 2.2 Re-renders y Estado Global

- `Providers` es Client Component (`src/components/providers.tsx`) que envuelve TODO con `<SessionProvider>`. Cada cambio de sesión re-renderiza el árbol entero.
- **No hay estado global** tipo Redux/Zustand store masivo. ✅
- Zustand está instalado pero **no se usa** en el código de componentes (solo testing). Eliminar de dependencies ahorra ~1.5 KB.

### 2.3 Transiciones y Suspense

- **No se usa `Suspense`** en ningún layout o página. El dashboard podría beneficiarse con un `<Suspense fallback={...}>` para la tabla de ventas mientras cargan las queries.
- **No se usa `startTransition`** para inputs de búsqueda/filtrado.

### 2.4 Virtualización

No hay listas largas que requieran virtualización. La tabla de pedidos muestra ~20-50 items por página. Correcto para el volumen.

---

## Paso 3 — Backend: API Performance

### 3.1 Dashboard — El Peor Infractor

`src/app/(app)/dashboard/page.tsx` — **11 queries Prisma** en la carga inicial:

```
1. prisma.pedido.findMany (hoy)
2. prisma.pedido.findMany (ayer)
3. prisma.config.findUnique (BASE_DIA)
4. prisma.cierreDia.findFirst (último cierre)
5. prisma.gasto.aggregate (hoy)
6. prisma.embarque.count (ABIERTO hoy)
7. prisma.cliente.count (activos)
8. prisma.insumo.findMany (stock bajo)
9. prisma.pedido.aggregate (fiados totales)
10. prisma.produccion.aggregate (hoy)
11. prisma.config.findMany (STOCK_INI_*) — CONDICIONAL!
```

Las queries 1-10 se ejecutan en `Promise.all([])` ✅ (correcto). Pero la query #11 es **secuencial** después de evaluar `if (stockIniAgua === 0 && stockIniHielo === 0)`. Esto debería moverse al `Promise.all` inicial o resolverse con un `LEFT JOIN`.

**TTFB estimado**: 10 queries paralelas + 1 secuencial = ~400-800ms en dev local PostgreSQL. En Supabase remoto con PgBouncer: ~200-400ms.

**Fix**: Mover la query #11 al Promise.all inicial y aplicar coalesce en memoria.

### 3.2 API Response Time por Ruta

| Ruta | Queries | Includes | Cacheable | Estimado p95 |
|------|---------|----------|-----------|--------------|
| `GET /api/embarques` | 4 queries (paralelo) | Sí | No | ~100ms |
| `GET /api/pedidos?all=true` | 2 queries | cliente | No | ~80ms |
| `GET /api/clientes/[id]` | 1 query + análisis JS | pedidos, facturas, conteo | No | ~60ms |
| `POST /api/pedidos` | Transacción + factura + pagos | — | No | ~200ms |
| `POST /api/embarques/[id]/cerrar` | Transacción masiva | pedidos, pagos | No | ~300ms |

### 3.3 Over-fetching

| Endpoint | Problema | Fix |
|----------|---------|-----|
| `GET /api/clientes/[id]` | Retorna 20 pedidos + 20 facturas + análisis | Usar `select` para limitar campos |
| `GET /api/pedidos?all=true` | Retorna TODOS los pedidos sin límite | Ya tiene paginación, el flag `all` es el problema |
| `GET /api/embarques` | Incluye todos los pedidos con cliente y pagos anidados | Paginar o limitar |

### 3.4 Serialización

Muchas rutas hacen `JSON.parse(JSON.stringify(data))` para serializar Decimal/Date de Prisma. Esto es **CPU-intensive** en objetos grandes.

**Fix**: Usar `Number(value)` para Decimal (como recomienda AGENTS.md) y `.toISOString()` para Date en el mapper, en vez de double-JSON.

---

## Paso 4 — Caching Strategy

### 4.1 Lo que NO se cachea

- **Dashboard**: `export const dynamic = 'force-dynamic'` en `src/app/(app)/dashboard/page.tsx:6`. Esto DESACTIVA todo el caching de Next.js para esta ruta. Cada visita al dashboard ejecuta 11 queries fresh.
- **API de precios**: `GET /api/precios/tabla` se consulta en cada render de pedido-form y venta-rapida-form
- **API de clientes**: `GET /api/clientes?all=true` se consulta en múltiples páginas (embarques, pedidos, recurrentes)

### 4.2 Oportunidades de Cache

| Dato | Frecuencia de cambio | Estrategia |
|------|---------------------|------------|
| `GET /api/precios/tabla` | Semanal/mensual | `stale-while-revalidate` 5 min |
| `GET /api/config` | Casi nunca | `stale-while-revalidate` 1 hora |
| `GET /api/productos` | Raro | Cache 1 día |
| `GET /api/trabajadores` | Mensual | `stale-while-revalidate` 10 min |
| Datos del dashboard | Constante | ISR con revalidate cada 2 min |

### 4.3 Lo que YA está bien

- Service Worker (`public/sw.js`) cachea `/` y `/offline` para modo offline
- Dexie (IndexedDB) para datos offline-first locales
- CSP nonce evita cacheo agresivo de HTML — correcto para auth

---

## Paso 5 — Base de Datos

(Ver también `DB_AUDIT_REPORT.md` para análisis completo de schema e índices)

### 5.1 Queries Problemáticas

**Dashboard — query #11 condicional**:
```typescript
// src/app/(app)/dashboard/page.tsx:163-171
if (stockIniAgua === 0 && stockIniHielo === 0) {
  const configs = await prisma.config.findMany({ ... })
  // ...
}
```
Esta query es secuencial al bloque Promise.all principal.

**Fix**: Incluirla en Promise.all:
```typescript
const [..., configsStock] = await Promise.all([
  // ... queries existentes
  prisma.config.findMany({
    where: { clave: { in: ['STOCK_INI_AGUA', 'STOCK_INI_HIELO', 'STOCK_INI_BOTELLON'] } }
  }),
])
// Luego en memoria:
if (stockIniAgua === 0 && stockIniHielo === 0) {
  const configMap = Object.fromEntries(configsStock.map(c => [c.clave, c.valor]))
  // ...
}
```

### 5.2 Índices

101 índices para 15MB. Ver `DB_AUDIT_REPORT.md` Paso 2 para análisis completo.

### 5.3 Conexiones

- `max_connections = 100` (PostgreSQL default)
- Sin PgBouncer configurado en dev
- Prisma no tiene connection pooling configurado explícitamente

---

## Paso 6 — Network y Transferencia

### 6.1 HTTP Headers

`next.config.ts` configura headers de seguridad ✅ pero también aplica CSP estático que compite con el CSP dinámico del proxy.

### 6.2 Payload Sizes

| Endpoint | Payload típico | Paginado | Riesgo |
|----------|---------------|----------|--------|
| `GET /api/clientes?all=true` | ~15-50 KB | No | Medio |
| `GET /api/pedidos?all=true` | ~20-80 KB | Parcial | Medio |
| `GET /api/embarques` | ~10-30 KB | No | Bajo |
| Dashboard HTML | ~30-60 KB | N/A | Bajo |

### 6.3 Compresión

Next.js en producción activa gzip/brotli automáticamente. En dev no.

### 6.4 Service Worker

`public/sw.js` usa `NetworkFirst` para navegación y `CacheFirst` para assets estáticos. Correcto para offline-first en zonas rurales. Pero el SW cachea TODAS las respuestas de navegación, incluyendo HTML con datos stale.

---

## Paso 7 — Build Pipeline y DX

### 7.1 Build Performance

- **Turbopack**: 8.3s compile, 12.6s TypeScript, 538ms static generation = **~22s total**
- **Output**: `standalone` (Docker-ready)
- **Bundle size**: ~4.3 GB `.next/` directory (incluye dev + prod + sourcemaps + turbopack cache)

### 7.2 Dev Server

- HMR con Turbopack: **sub-segundo** ✅
- Startup: ~3-5s ✅
- TypeScript check: 12.6s

---

## Paso 8 — Escalabilidad y Proyección

### Qué fallará primero con 10x carga (60 usuarios → 600):

1. **Dashboard sin cache** — 11 queries por visita × 600 usuarios/día = 6,600 queries. Sin ISR, cada una pega a PostgreSQL.
2. **API clientes sin paginación** — `?all=true` con 10,000 clientes = payload de 2-5 MB.
3. **Sin connection pooling** — 100 conexiones PostgreSQL con 60 usuarios concurrentes y Prisma (que abre múltiples conexiones por query) podría agotar el pool.
4. **Embarques GET** — incluye pedidos anidados con pagos. Con 500 embarques activos, cada uno con 20 pedidos = 10,000 filas serializadas.

---

## Paso 9 — Recomendaciones Priorizadas

### Quick Wins (hoy/mañana — alto impacto, bajo esfuerzo)

| # | Acción | Archivo | Esfuerzo | Ganancia |
|---|--------|---------|----------|----------|
| 1 | **Mover query #11 del dashboard al Promise.all** | `dashboard/page.tsx` | 10 min | TTFB -150ms |
| 2 | **Lazy-load `BaseCajaModal`** | `layout.tsx` | 5 min | Bundle -6 KB, FCP -100ms |
| 3 | **Límite de 100 en `?all=true`** | `clientes/route.ts`, `pedidos/route.ts` | 10 min | Previene payloads gigantes |
| 4 | **Quitar `export const dynamic = 'force-dynamic'`** del dashboard, usar `revalidate = 60` | `dashboard/page.tsx` | 5 min | TTFB -300ms (visitas repetidas) |
| 5 | **Eliminar `uuid` dependency** — usar `crypto.randomUUID()` | `package.json` + imports | 15 min | Bundle -3 KB |
| 6 | **Eliminar `workbox-*` individuales** — solo `@serwist/next` | `package.json` | 5 min | Bundle -15 KB |

### Medias (esta semana)

| # | Acción | Esfuerzo | Ganancia |
|---|--------|----------|----------|
| 7 | **Migrar `app-shell.tsx` a Server Component** | 2h | JS en todas las páginas -20 KB |
| 8 | **Agregar `stale-while-revalidate` a `/api/precios/tabla`** | 30 min | Quita 1 request por página |
| 9 | **Cachear config en Redis/memoria** | 1h | Quita 1 query del dashboard |
| 10 | **Migrar 10 componentes a SC** | 3h | Bundle total -30 KB |

### Grandes (este mes — transformadoras)

| # | Acción | Esfuerzo | Ganancia |
|---|--------|----------|----------|
| 11 | **ISR para dashboard** con `revalidate = 120` | 2h | Dashboard carga en <100ms |
| 12 | **Edge caching para API reads** (Vercel Edge Config / Cloudflare KV) | 4h | API p95 <50ms |
| 13 | **Virtualización de tabla de pedidos** (si >200 items) | 3h | DOM nodes -80% |

---

### Performance Budget Propuesto

| Métrica | Target | Deadline |
|---------|--------|----------|
| Dashboard LCP | <1.5s | Esta semana |
| TTFB (API) | <100ms p95 | Esta semana |
| Initial bundle (gzip) | <100 KB | Este mes |
| Dashboard queries | ≤3 (con cache) | Esta semana |
| `?all=true` payloads | ≤200 items | Hoy |

---

### Top 5 Acciones Inmediatas

1. Dashboard query #11 a Promise.all (10 min)
2. `BaseCajaModal` dynamic import (5 min)
3. `force-dynamic` → `revalidate = 60` en dashboard (5 min)
4. Eliminar `uuid` + `workbox-*` redundantes (20 min)
5. Límite `?all=true` a 100 items (10 min)

---

*Fin del reporte. El dashboard son 11 queries cuando podrían ser 5-6 con cache. En 2G colombiano, cada query extra son 200-500ms de latencia. Arreglá eso primero.*
