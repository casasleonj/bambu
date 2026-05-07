# Agua Bambú v2 — Backlog Técnico

**Última actualización:** 2026-05-06  
**Rama activa:** `audit-performance`  
**Fuentes:** Stress Test (REPORT.md), API/DB/UX/Perf Audits (2026-05-04)

---

## P0 — Crítico (hacer YA)

### P0-1: Nota de Crédito para cancelaciones de pedidos
- **archivo:** `prisma/schema.prisma` + `src/app/api/pedidos/[id]/route.ts`
- **severidad:** P0
- **fuente:** stress-test (item 3)
- **fecha_reportado:** 2026-05-01
- **commit_resuelto:** `5b1c8d7` (2026-05-02)
- **notas:** Al cancelar pedido con pagos, crear NotaCredito automática. No borrar pagos. El cierre diario resta NC de totalVentas.

### P0-2: Bloquear cierre si hay embarques abiertos
- **archivo:** `src/app/api/cierre/route.ts`
- **severidad:** P0
- **fuente:** stress-test (item 6 + flujo empalme)
- **fecha_reportado:** 2026-05-02
- **commit_resuelto:** `5b1c8d7` (2026-05-02)
- **notas:** POST rechaza 400 si hay embarques ABIERTO. GET devuelve status INCOMPLETO + lista de embarques pendientes. El cierre solo refleja post-empalme.

### P0-3: CSP eliminar 'unsafe-eval'
- **archivo:** `next.config.ts:31`
- **severidad:** P0
- **fuente:** security-audit
- **fecha_reportado:** 2026-05-02
- **commit_resuelto:** `5b1c8d7` (2026-05-02)
- **notas:** No hay uso de eval/Function/new Function en el código. Eliminar 'unsafe-eval' del script-src reduce XSS surface.

### P0-4: Filtro ANULADO en cierre GET
- **archivo:** `src/app/api/cierre/route.ts:18`
- **severidad:** P0
- **fuente:** security-audit
- **fecha_reportado:** 2026-05-02
- **commit_resuelto:** `5b1c8d7` (2026-05-02)
- **notas:** Cierre GET filtra CANCELADO pero no ANULADO. Cambiar a `estado: { notIn: [CANCELADO, ANULADO] }`.

---

## P1 — Alto (esta semana)

### P1-5: requireRole en POST /api/pedidos
- **archivo:** `src/app/api/pedidos/route.ts:63`
- **severidad:** P1
- **fuente:** security-audit
- **fecha_reportado:** 2026-05-02
- **commit_resuelto:** `5b1c8d7` (2026-05-02)
- **notas:** Solo ADMIN/ASISTENTE pueden crear pedidos. REPARTIDOR no debería crear.

### P1-6: requireRole en POST /api/clientes
- **archivo:** `src/app/api/clientes/route.ts:46`
- **severidad:** P1
- **fuente:** security-audit
- **fecha_reportado:** 2026-05-02
- **commit_resuelto:** `5b1c8d7` (2026-05-02)
- **notas:** Solo ADMIN/ASISTENTE pueden crear clientes.

### P1-7: requireRole en POST /api/produccion
- **archivo:** `src/app/api/produccion/route.ts:45`
- **severidad:** P1
- **fuente:** security-audit
- **fecha_reportado:** 2026-05-02
- **commit_resuelto:** `5b1c8d7` (2026-05-02)
- **notas:** Solo ADMIN puede registrar producción.

### P1-8: ASISTENTE no puede ver /nomina
- **archivo:** `src/middleware.ts:24-29`
- **severidad:** P1
- **fuente:** stress-test (item 10)
- **fecha_reportado:** 2026-05-01
- **commit_resuelto:** `5b1c8d7` (2026-05-02)
- **notas:** Agregar `/nomina` a `ADMIN_PAGE_ROUTES`.

### P1-9: Validar recurrente único por cliente+frecuencia
- **archivo:** `src/app/api/recurrentes/route.ts`
- **severidad:** P1
- **fuente:** stress-test (item 4)
- **fecha_reportado:** 2026-05-01
- **commit_resuelto:** `5b1c8d7` (2026-05-02)
- **notas:** Al crear recurrente, verificar que no exista otro con mismo clienteId + frecuencia.

### P1-10: Eliminar `as any` en reportes/ventas
- **archivo:** `src/app/api/reportes/ventas/route.ts:38`
- **severidad:** P1
- **fuente:** security-audit
- **fecha_reportado:** 2026-05-02
- **commit_resuelto:** `5b1c8d7` (2026-05-02)
- **notas:** Usar `EstadoPedido.CANCELADO` en vez de `'CANCELADO' as any`.

---

## P2 — Medio (este mes)

### P2-11: Embarques GET ownership check
- **archivo:** `src/app/api/embarques/[id]/route.ts:9`
- **severidad:** P2
- **fuente:** security-audit
- **fecha_reportado:** 2026-05-02
- **commit_resuelto:** `5b1c8d7` (2026-05-02)
- **notas:** Verificar que un repartidor no pueda ver embarques de otros con requireOwnership.

### P2-12: Standardizar API responses
- **archivo:** Todos los route handlers
- **severidad:** P2
- **fuente:** security-audit
- **fecha_reportado:** 2026-05-02
- **commit_resuelto:** `audit-performance` — `src/lib/api-response.ts`
- **notas:** Helper `apiSuccess()`, `apiError()`, `apiList()` para envelope consistente `{ success, data, error }`. Aplicado a: trabajadores, clientes, pedidos, embarques, rutas, proveedores, insumos, precios.

### P2-13: Prisma migrations versionadas
- **archivo:** `prisma/migrations/`
- **severidad:** P2
- **fuente:** security-audit
- **fecha_reportado:** 2026-05-02
- **commit_resuelto:** `0f696ac` (2026-05-04)
- **notas:** Baseline migration creada en `prisma/migrations/0_init/`. Ya no se usa `db push`.

### P2-14: Empty states consistentes (UX)
- **archivo:** `src/components/empty-state.tsx` + páginas
- **severidad:** P2
- **fuente:** ux-audit (plan 2026-04-29, Task 1-2)
- **fecha_reportado:** 2026-04-29
- **commit_resuelto:** `audit-performance`
- **notas:** Componente EmptyState creado y aplicado a trabajadores, insumos, rutas.

### P2-15: loading.tsx para Server Components (UX)
- **archivo:** `src/app/(app)/loading.tsx` + `src/app/(app)/dashboard/loading.tsx`
- **severidad:** P2
- **fuente:** ux-audit (plan 2026-04-29, Task 3)
- **fecha_reportado:** 2026-04-29
- **commit_resuelto:** `audit-performance`
- **notas:** Loading global creado.

### P2-16: Error states con retry (UX)
- **archivo:** pedidos, embarques, rutas, recurrentes, cierre, clientes, trabajadores, insumos
- **severidad:** P2
- **fuente:** ux-audit (plan 2026-04-29, Task 4)
- **fecha_reportado:** 2026-04-29
- **commit_resuelto:** `audit-performance` (2026-05-02) + `cierre-client` (2026-05-06)
- **notas:** fetchError state + retry button en 9/10 páginas. Solo reportes (SC con error boundary) no aplica.

### P2-17: Double-click protection (UX)
- **archivo:** trabajadores-client.tsx, rutas/page.tsx
- **severidad:** P2
- **fuente:** ux-audit (plan 2026-04-29, Task 5)
- **fecha_reportado:** 2026-04-29
- **commit_resuelto:** `audit-performance`
- **notas:** submitting state en botones de submit (trabajadores, clientes).

### P2-18: Filter persistence URL en pedidos (UX)
- **archivo:** `src/app/(app)/pedidos/page.tsx`
- **severidad:** P2
- **fuente:** ux-audit (plan 2026-04-29, Task 8)
- **fecha_reportado:** 2026-04-29
- **commit_resuelto:** `audit-performance`
- **notas:** Filtros de estado/tipo/search en URL params. Ya implementado.

### P2-19: Custom 404 page (UX)
- **archivo:** `src/app/not-found.tsx`
- **severidad:** P2
- **fuente:** ux-audit (plan 2026-04-29, Task 9)
- **fecha_reportado:** 2026-04-29
- **commit_resuelto:** `audit-performance`
- **notas:** Página 404 personalizada creada.

### P2-20: Accessibility improvements (UX)
- **archivo:** modal.tsx, layout.tsx, forms
- **severidad:** P2
- **fuente:** ux-audit (plan 2026-04-29, Task 7)
- **fecha_reportado:** 2026-04-29
- **commit_resuelto:** `audit-performance`
- **notas:** htmlFor/id en labels de trabajadores, clientes, insumos forms.

---

## ✅ Resueltos (trazabilidad)

| Item | Fuente | Commit |
|------|--------|--------|
| Abono actualiza Pedido.saldo | stress-test (item 9) | `audit-performance` — `src/app/api/abonos/route.ts:90-96` |
| Advisory locks en secuencias | stress-test + QA | `audit-performance` — `src/lib/locks.ts` |
| Timing-safe login | security-audit | `audit-performance` — `src/lib/auth.ts:8-52` |
| Rate limiting | security-audit | `audit-performance` — `src/lib/rate-limit.ts` |
| CSRF protection | security-audit | `audit-performance` — `src/lib/csrf.ts` + `src/middleware.ts` |
| Zod en todas las APIs POST/PUT | security-audit | `audit-performance` — `src/lib/validators.ts` |
| Docker localhost (127.0.0.1) | security-audit | `audit-performance` — `docker-compose.yml` |
| Seed passwords aleatorias | security-audit | `audit-performance` — `prisma/seed.ts` |
| Sanitización de logs | security-audit | `audit-performance` — todos los console.error |
| N+1 pricing fix | perf-audit | `audit-performance` — `src/app/api/pedidos/route.ts` |
| Transaction safety (pedido+factura) | QA | `audit-performance` — `src/app/api/pedidos/route.ts` |
| CSFR hostname validation | security-audit | `audit-performance` — `src/lib/csrf.ts` |
| DB indexes | perf-audit | `audit-performance` — `prisma/schema.prisma` (40+ índices) |
| SC layout + error boundaries | UX audit | `audit-performance` — commit `c6dfa03` |
| PWA icons | UX audit | `audit-performance` — commit `c6dfa03` |
| Factura.saldo se actualiza con abonos | stress-test (item 1) | `audit-performance` — `src/app/api/abonos/route.ts:68-75` |
| Factura creada con advisory lock | stress-test | `audit-performance` — `src/app/api/facturas/route.ts` |
| Embarque.pacasAgua/pacasHielo al cerrar | stress-test (item 2) | `audit-performance` — `src/app/api/embarques/[id]/cerrar/route.ts:346-359` |
| Pedidos CANCELADO revertir pagos | stress-test (item 3) | `audit-performance` — `src/app/api/pedidos/[id]/route.ts:62-84` |
| Filtro CANCELADO en cierre GET | stress-test (item 7) | `audit-performance` — `src/app/api/cierre/route.ts:18` |
| requireOwnership en embarques/pedidos | security-audit | `audit-performance` — `src/lib/auth-check.ts` |
| requireRole en embarques APIs | security-audit | `audit-performance` — `src/app/api/embarques/route.ts` |
| requireRole en recurrentes/rutas/precios | security-audit | `audit-performance` — `src/app/api/recurrentes/route.ts` |
| Auth middleware en APIs | security-audit | `audit-performance` — `src/middleware.ts` |
| Auth constants (ROLES, PRIVILEGED_ROLES) | security-audit | `audit-performance` — `src/lib/constants.ts` |
| JWT re-verificación cada 5 min | security-audit | `audit-performance` — `src/lib/auth.ts:68-85` |
| TrustHost configurable | security-audit | `audit-performance` — `src/lib/auth.ts:105` |
| Require auth en POST/PUT/PATCH/DELETE APIs | security-audit | `audit-performance` — `src/middleware.ts:94-98` |

---

## P3 — Bajo (resueltos 2026-05-06)

### P3-21: Audit: 5 endpoints sin requireRole + 1 sin requireOwnership
- **archivo:** `clientes/[id]`, `proveedores/[id]`, `proveedores`, `insumos`, `clientes/quick`, `embarques/[id]`
- **severidad:** 🔴 CRÍTICA → P3
- **fuente:** API_AUDIT_REPORT.md (2026-05-04)
- **fecha_resuelto:** 2026-05-04
- **commit_resuelto:** `f3e2878`
- **notas:** requireRole en 5 write endpoints, requireOwnership en PUT embarques, netoCaja server-side, clientes/quick info leak sanitzado.

### P3-22: Audit: UX criticals
- **archivo:** múltiples
- **severidad:** 🔴 CRÍTICA → P3
- **fuente:** UX_AUDIT_REPORT.md (2026-05-04)
- **fecha_resuelto:** 2026-05-05
- **commit_resuelto:** `de9469b`
- **notas:** SW duplicado eliminado, VentaRapidaForm envuelto en `<form>`, sidebar inert, login a11y (autocomplete + labels), Modal title/description, 7/8 confirm()→useConfirm (el 8vo en cierre-client 2026-05-06), aria-labels.

### P3-23: Audit: Performance quick wins
- **archivo:** `dashboard/page.tsx`, `layout.tsx`, `pedidos/route.ts`, `package.json`
- **severidad:** P3
- **fuente:** PERFORMANCE_AUDIT_REPORT.md (2026-05-04)
- **fecha_resuelto:** 2026-05-05
- **commit_resuelto:** `29d8214`
- **notas:** Dashboard query #11 a Promise.all, ?all=true limit 200, uuid/workbox-* eliminados, BaseCajaModal lazy-loaded (2026-05-06).

### P3-24: Dashboard caching
- **archivo:** `dashboard/page.tsx:6`
- **severidad:** P3
- **fuente:** PERFORMANCE_AUDIT_REPORT.md (2026-05-04)
- **fecha_resuelto:** 2026-05-06
- **notas:** `force-dynamic` → `revalidate = 60`. Visitas repetidas al dashboard cargan en <100ms con ISR.

### P3-25: Factura innecesaria para PUNTO pagado completo
- **archivo:** `api/pedidos/route.ts:175`
- **severidad:** P3
- **fuente:** stress-test (item 8)
- **fecha_resuelto:** 2026-05-06
- **notas:** Solo se crea factura si `tipo !== 'PUNTO' || totalPagado < total`. Punto de venta contado no genera factura.

### P3-26: Health check endpoint
- **archivo:** `api/health/route.ts`
- **severidad:** P3
- **fuente:** API_AUDIT_REPORT.md (2026-05-04)
- **fecha_resuelto:** 2026-05-06
- **notas:** `GET /api/health` verifica DB con `SELECT 1`. Retorna `{ status: "ok", timestamp }` o 503.

### P3-27: Correlation ID en requests
- **archivo:** `proxy.ts`, `lib/request-id.ts`, `lib/logger.ts`
- **severidad:** P3
- **fuente:** API_AUDIT_REPORT.md (2026-05-04)
- **fecha_resuelto:** 2026-05-06
- **notas:** `X-Request-Id` en todas las responses. `AsyncLocalStorage` para propagar a API routes y pino logger via `mixin()`.

### P3-28: DB roles no-superuser
- **archivo:** `docker-compose.yml`, `schema.prisma`, `.env`, `docker-entrypoint-initdb.d/01-roles.sql`
- **severidad:** 🔴 CRÍTICA → P3
- **fuente:** DB_AUDIT_REPORT.md (2026-05-04)
- **fecha_resuelto:** 2026-05-06
- **notas:** Roles `app_write`/`app_read` creados con permisos mínimos. `DATABASE_URL` usa `app_write`, `DIRECT_URL` usa `bambu` solo para migrations. Init script para DB nueva + `scripts/setup-roles.sql` para DB existente.

### P3-29: OpenAPI/Swagger documentation
- **archivo:** `api/openapi.json/route.ts`
- **severidad:** P3
- **fuente:** API_AUDIT_REPORT.md (2026-05-04)
- **fecha_resuelto:** 2026-05-06
- **notas:** Spec OpenAPI 3.1 completa: 34 paths, 61 endpoints, 32 schemas. Accesible en `GET /api/openapi.json`.

### P3-30: Precios reales al cerrar embarque
- **archivo:** `api/embarques/[id]/cerrar/route.ts`, `lib/pricing.ts`
- **severidad:** P3
- **fuente:** stress-test (item 11)
- **fecha_resuelto:** 2026-05-06
- **notas:** Al cerrar embarque sin `preciosReales`, resuelve contra `PrecioVolumen` vigente + `preciosEspeciales` del cliente via `resolverPreciosPedido()`. Pricing engine acepta transaction client.

### P3-31: app-shell.tsx → Server Component
- **archivo:** `app-shell.tsx` (195L → 14L), nuevos `header.tsx`, `sidebar.tsx`, `nav-data.tsx`
- **severidad:** P3
- **fuente:** PERFORMANCE_AUDIT_REPORT.md (2026-05-04)
- **fecha_resuelto:** 2026-05-06
- **notas:** Layout externo es SC. Header/Sidebar son CCs finos que usan zustand store para sidebarOpen. JS del shell en cada página reducido ~80%.

### P3-32: logAudit fire-and-forget
- **archivo:** 12 rutas API
- **severidad:** P3
- **fuente:** API_AUDIT_REPORT.md (2026-05-04)
- **fecha_resuelto:** 2026-05-06
- **notas:** 19 `await logAudit(...)` → `logAudit(...)`. Eliminados ~2-5ms de latencia por POST/PUT. logAudit ya tiene try/catch interno.

### P3-33: Typos y accesibilidad
- **archivo:** 15 archivos
- **severidad:** P3
- **fuente:** UX_AUDIT_REPORT.md (2026-05-04)
- **fecha_resuelto:** 2026-05-06
- **notas:** 22 typos corregidos (Teléfono, Dirección, vacío, conexión). RutaForm: 6 htmlFor/id pares + fieldset/legend + aria-pressed. EmptyState: role="status" aria-live. prefers-reduced-motion + :focus-visible global.

---

## Cambios de Estado

| Fecha | Item | De | A | Notas |
|-------|------|----|---|-------|
| 2026-05-06 | 22 items resueltos | PENDIENTE | ✅ | Ver P3-21 a P3-33 + bugs reales corregidos |
| 2026-05-02 | Item 6 (cPacaAguaEnt vs cPacaAguaPed) | BUG | NO ES BUG | Flujo empalme: cPacaAguaEnt es correcto |
| 2026-05-02 | Item 6 → nuevo requerimiento | — | P0-2 | Bloquear cierre si embarques abiertos |
