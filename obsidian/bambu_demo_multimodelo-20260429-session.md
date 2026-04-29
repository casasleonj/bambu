# Sesión 2026-04-29 — Security Hardening, Tests, Dashboard, CRM, Offline Sync

## Commits realizados

| Commit | Descripción |
|--------|-------------|
| `11c18ac` | feat: security, audit, tests, dashboard, CRM, offline sync |

---

## 1. Security Fixes

### HSTS + CSP Tighten
- **Cambio:** `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- **CSP:** Agregados `base-uri 'self'` y `form-action 'self'`
- **Archivo:** `next.config.ts`

### CSRF Protection
- **Cambio:** Nuevo middleware `validateCsrf()` que valida `Origin`/`Referer` para POST/PUT/DELETE/PATCH
- **Excepciones:** Dev mode (para Postman/curl), Auth.js endpoints
- **Archivos:** `src/lib/csrf.ts`, `src/middleware.ts`

### Dependency Audit
- **Resultado:** 4 vulnerabilidades moderadas de `postcss` vía Next.js (requeriría upgrade de Next.js)
- **Action:** Documentado, no bloqueante para producción

---

## 2. Audit Trail

- **Cambio:** `logAudit()` utility en `src/lib/audit.ts` + `logBulkAudit()`
- **Integración:** CREATE/UPDATE/DELETE en Pedidos, Clientes, Embarques, Facturas
- **Modelo:** Reutiliza `Historial` existente (antes sin usar)
- **Seguridad:** Audit logging nunca rompe la transacción principal (try/catch + console.error)

---

## 3. E2E Tests (9 nuevos)

| Archivo | Tests | Descripción |
|---------|-------|-------------|
| `e2e/cierre.spec.ts` | 3 | Page load, RBAC redirect, stock input |
| `e2e/embarques.spec.ts` | 3 | Page load, crear embarque, abrir/cerrar detalle |
| `e2e/produccion.spec.ts` | 3 | Stepper, navegación pasos, cálculo promedio |

**Total:** 13/13 tests passing (incluyendo 4 previos de pedidos/facturas)

---

## 4. Performance: Code Splitting

- **Cambio:** `PedidoForm` y `VentaRapidaForm` cargan vía `next/dynamic` con `{ ssr: false }`
- **Beneficio:** Bundle inicial más pequeño, modales cargan on-demand
- **Archivo:** `src/app/(app)/pedidos/page.tsx`

---

## 5. Feature: Embarques Automáticos

- **Endpoint:** `POST /api/embarques/auto`
- **Lógica:**
  1. Busca pedidos PENDIENTE sin embarque
  2. Agrupa por `rutaId` (o `barrio` como fallback)
  3. Crea un embarque por grupo con repartidor rotativo
  4. Asigna pedidos y cambia estado a EN_RUTA
- **UI:** Botón "Auto-Generar" en página de embarques

---

## 6. Dashboard Mejorado

| Mejora | Descripción |
|--------|-------------|
| Trend indicators | ↑↓ % vs ayer en pedidos y ventas |
| Alert cards | Pedidos pendientes >5, fiados >$500k, stock bajo, embarques activos |
| Hourly bar chart | CSS puro, ventas por hora (6am-5pm), tooltip hover |
| Comparativas | `getYesterdayRange()` en `src/lib/dates.ts` |

---

## 7. CRM: Recomendador Predictivo

- **Endpoint:** `GET /api/clientes/recomendaciones`
- **Lógica:**
  - Clientes sin pedidos → "Llamar para ofrecer"
  - Clientes con frecuencia configurada (`cadaNDias`) o promedio calculado → detecta retraso
  - Producto más comprado sugerido para la llamada
  - Ordenado por urgencia (alta/media) y días de retraso
- **Output:** Top 20 recomendaciones con sugerencia de llamada

---

## 8. Offline Sync: Conflict Resolution

- **Estrategias:** `local-wins`, `server-wins`, `merge`
- **Funciones:**
  - `resolveConflict()` — aplica estrategia y re-queuea si es necesario
  - `getConflicts()` — lista items con `syncStatus: 'conflict'`
  - `processSyncQueue()` — procesa cola batch con contadores
- **Archivo:** `src/lib/db/offline.ts`

---

## 9. Bug Fixes

### Login Hydration Error
- **Causa:** `process.env.NODE_ENV` en `'use client'` evalúa distinto SSR vs client con Turbopack
- **Fix:** `showDevHint` state + `useEffect` para evaluar post-hydration
- **Archivo:** `src/app/(auth)/login/page.tsx`

### Service Worker Stale Cache
- **Causa:** Worktree `feat-8-week-impl` tenía SW cacheado en `localhost:3000`, persistía al cambiar a main
- **Fix:** `ServiceWorkerRegister` ahora unregistra SW + limpia caches en `development`
- **Eliminación:** `git worktree remove --force .worktrees/feat-8-week-impl`
- **Archivo:** `src/components/sw-register.tsx`

---

## 10. Cancelar Embarques

- **Schema:** Agregado `CANCELADO` a `EstadoEmbarque`
- **Reglas:**
  - ABIERTO → CANCELADO: ✅ Permite, desasigna pedidos (vuelven a PENDIENTE)
  - CERRADO → CANCELADO: ❌ Bloqueado (400), afecta comisiones y cierre
- **Soft delete:** No hay hard-delete, CANCELADO queda en BD para auditoría
- **UI:** Botón rojo "Cancelar" en modal de detalle (solo ABIERTO)
- **Lista:** GET excluye CANCELADO del listado
- **Audit:** Cada cancelación logueada en `Historial`

---

## Archivos creados

| Archivo | Propósito |
|---------|-----------|
| `src/lib/audit.ts` | Audit logging utility |
| `src/lib/csrf.ts` | CSRF protection middleware |
| `src/app/api/embarques/auto/route.ts` | Auto-generar embarques |
| `src/app/api/clientes/recomendaciones/route.ts` | CRM predictivo |
| `e2e/cierre.spec.ts` | Tests cierre día |
| `e2e/embarques.spec.ts` | Tests embarques |
| `e2e/produccion.spec.ts` | Tests producción |

---

## Archivos modificados (claves)

| Archivo | Cambios |
|---------|---------|
| `next.config.ts` | HSTS, CSP tighten |
| `src/middleware.ts` | CSRF validation |
| `prisma/schema.prisma` | EstadoEmbarque.CANCELADO |
| `src/app/(auth)/login/page.tsx` | Hydration fix (useEffect) |
| `src/components/sw-register.tsx` | Dev mode SW unregistration |
| `src/app/(app)/dashboard/page.tsx` | Trends, alerts, hourly chart |
| `src/app/(app)/embarques/page.tsx` | Auto-generar, cancelar, badge CANCELADO |
| `src/app/api/embarques/[id]/route.ts` | DELETE endpoint con validaciones |
| `src/app/api/embarques/route.ts` | Excluye CANCELADO del listado |
| `src/app/(app)/pedidos/page.tsx` | next/dynamic code splitting |
| `src/lib/dates.ts` | getYesterdayRange() |
| `src/lib/db/offline.ts` | Conflict resolution + sync queue |

---

## Validación

- ✅ `npx tsc --noEmit` — limpio
- ✅ `npx playwright test` — 13/13 passing
- ✅ `npx prisma db push` — pendiente (enum CANCELADO)

---

## Próximos pasos sugeridos

1. **Run `npx prisma db push`** para aplicar enum CANCELADO
2. **HSTS explícito** en production headers (ya en next.config.ts, verificar en Vercel)
3. **Redis** para rate limiting distribuido (ahora es por instancia)
4. **Tests E2E** para cancelar embarque y recomendaciones CRM
5. **Voice search** para clientes en página de pedidos
6. **PWA install prompt** para usuarios rurales (2G/3G)
