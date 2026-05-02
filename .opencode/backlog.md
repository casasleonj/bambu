# Agua Bambú v2 — Backlog Técnico

**Última actualización:** 2026-05-02  
**Rama activa:** `audit-performance`  
**Fuentes:** Stress Test (REPORT.md), Security Audit (2026-05-02), UX Audit Plan

---

## P0 — Crítico (hacer YA)

### P0-1: Nota de Crédito para cancelaciones de pedidos
- **archivo:** `prisma/schema.prisma` + `src/app/api/pedidos/[id]/route.ts`
- **severidad:** P0
- **fuente:** stress-test (item 3)
- **fecha_reportado:** 2026-05-01
- **commit_resuelto:**
- **notas:** Al cancelar pedido con pagos, crear NotaCredito automática. No borrar pagos. El cierre diario resta NC de totalVentas.

### P0-2: Bloquear cierre si hay embarques abiertos
- **archivo:** `src/app/api/cierre/route.ts`
- **severidad:** P0
- **fuente:** stress-test (item 6 + flujo empalme)
- **fecha_reportado:** 2026-05-02
- **commit_resuelto:**
- **notas:** POST rechaza 400 si hay embarques ABIERTO. GET devuelve status INCOMPLETO + lista de embarques pendientes. El cierre solo refleja post-empalme.

### P0-3: CSP eliminar 'unsafe-eval'
- **archivo:** `next.config.ts:31`
- **severidad:** P0
- **fuente:** security-audit
- **fecha_reportado:** 2026-05-02
- **commit_resuelto:**
- **notas:** No hay uso de eval/Function/new Function en el código. Eliminar 'unsafe-eval' del script-src reduce XSS surface.

### P0-4: Filtro ANULADO en cierre GET
- **archivo:** `src/app/api/cierre/route.ts:18`
- **severidad:** P0
- **fuente:** security-audit
- **fecha_reportado:** 2026-05-02
- **commit_resuelto:**
- **notas:** Cierre GET filtra CANCELADO pero no ANULADO. Cambiar a `estado: { notIn: [CANCELADO, ANULADO] }`.

---

## P1 — Alto (esta semana)

### P1-5: requireRole en POST /api/pedidos
- **archivo:** `src/app/api/pedidos/route.ts:63`
- **severidad:** P1
- **fuente:** security-audit
- **fecha_reportado:** 2026-05-02
- **commit_resuelto:**
- **notas:** Solo ADMIN/ASISTENTE pueden crear pedidos. REPARTIDOR no debería crear.

### P1-6: requireRole en POST /api/clientes
- **archivo:** `src/app/api/clientes/route.ts:46`
- **severidad:** P1
- **fuente:** security-audit
- **fecha_reportado:** 2026-05-02
- **commit_resuelto:**
- **notas:** Solo ADMIN/ASISTENTE pueden crear clientes.

### P1-7: requireRole en POST /api/produccion
- **archivo:** `src/app/api/produccion/route.ts:45`
- **severidad:** P1
- **fuente:** security-audit
- **fecha_reportado:** 2026-05-02
- **commit_resuelto:**
- **notas:** Solo ADMIN puede registrar producción.

### P1-8: ASISTENTE no puede ver /nomina
- **archivo:** `src/middleware.ts:24-29`
- **severidad:** P1
- **fuente:** stress-test (item 10)
- **fecha_reportado:** 2026-05-01
- **commit_resuelto:**
- **notas:** Agregar `/nomina` a `ADMIN_PAGE_ROUTES`.

### P1-9: Validar recurrente único por cliente+frecuencia
- **archivo:** `src/app/api/recurrentes/route.ts`
- **severidad:** P1
- **fuente:** stress-test (item 4)
- **fecha_reportado:** 2026-05-01
- **commit_resuelto:**
- **notas:** Al crear recurrente, verificar que no exista otro con mismo clienteId + frecuencia.

### P1-10: Eliminar `as any` en reportes/ventas
- **archivo:** `src/app/api/reportes/ventas/route.ts:38`
- **severidad:** P1
- **fuente:** security-audit
- **fecha_reportado:** 2026-05-02
- **commit_resuelto:**
- **notas:** Usar `EstadoPedido.CANCELADO` en vez de `'CANCELADO' as any`.

---

## P2 — Medio (este mes)

### P2-11: Embarques GET ownership check
- **archivo:** `src/app/api/embarques/[id]/route.ts:9`
- **severidad:** P2
- **fuente:** security-audit
- **fecha_reportado:** 2026-05-02
- **commit_resuelto:**
- **notas:** Verificar que un repartidor no pueda ver embarques de otros con requireOwnership.

### P2-12: Standardizar API responses
- **archivo:** Todos los route handlers
- **severidad:** P2
- **fuente:** security-audit
- **fecha_reportado:** 2026-05-02
- **commit_resuelto:**
- **notas:** Crear helper `apiResponse()` para envelope consistente `{ success, data, error }`.

### P2-13: Prisma migrations versionadas
- **archivo:** `prisma/migrations/`
- **severidad:** P2
- **fuente:** security-audit
- **fecha_reportado:** 2026-05-02
- **commit_resuelto:**
- **notas:** Crear baseline migration, dejar de usar `db push`.

### P2-14: Empty states consistentes (UX)
- **archivo:** `src/components/empty-state.tsx` + páginas
- **severidad:** P2
- **fuente:** ux-audit (plan 2026-04-29, Task 1-2)
- **fecha_reportado:** 2026-04-29
- **commit_resuelto:**
- **notas:** Crear componente EmptyState reutilizable. Aplicar a pedidos, embarques, rutas, recurrentes, trabajadores, insumos, nomina, compras, facturas, gastos.

### P2-15: loading.tsx para Server Components (UX)
- **archivo:** `src/app/(app)/loading.tsx` + `src/app/(app)/dashboard/loading.tsx`
- **severidad:** P2
- **fuente:** ux-audit (plan 2026-04-29, Task 3)
- **fecha_reportado:** 2026-04-29
- **commit_resuelto:**
- **notas:** Crear loading global y dashboard skeleton.

### P2-16: Error states con retry (UX)
- **archivo:** pedidos, embarques, rutas, recurrentes, cierre, clientes, trabajadores, insumos
- **severidad:** P2
- **fuente:** ux-audit (plan 2026-04-29, Task 4)
- **fecha_reportado:** 2026-04-29
- **commit_resuelto:**
- **notas:** Agregar fetchError state + retry button en todas las páginas con data fetching.

### P2-17: Double-click protection (UX)
- **archivo:** trabajadores-client.tsx, rutas/page.tsx
- **severidad:** P2
- **fuente:** ux-audit (plan 2026-04-29, Task 5)
- **fecha_reportado:** 2026-04-29
- **commit_resuelto:**
- **notas:** Agregar submitting state a botones de submit/delete.

### P2-18: Filter persistence URL en pedidos (UX)
- **archivo:** `src/app/(app)/pedidos/page.tsx`
- **severidad:** P2
- **fuente:** ux-audit (plan 2026-04-29, Task 8)
- **fecha_reportado:** 2026-04-29
- **commit_resuelto:**
- **notas:** Filtros de estado/tipo/search en URL params. Sobreviven refresh.

### P2-19: Custom 404 page (UX)
- **archivo:** `src/app/not-found.tsx`
- **severidad:** P2
- **fuente:** ux-audit (plan 2026-04-29, Task 9)
- **fecha_reportado:** 2026-04-29
- **commit_resuelto:**
- **notas:** Página 404 personalizada con link a dashboard.

### P2-20: Accessibility improvements (UX)
- **archivo:** modal.tsx, layout.tsx, forms
- **severidad:** P2
- **fuente:** ux-audit (plan 2026-04-29, Task 7)
- **fecha_reportado:** 2026-04-29
- **commit_resuelto:**
- **notas:** aria-describedby en modal, aria-current en nav, htmlFor/id en labels, aria-label en icon buttons.

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

## Cambios de Estado

| Fecha | Item | De | A | Notas |
|-------|------|----|---|-------|
| 2026-05-02 | Item 6 (cPacaAguaEnt vs cPacaAguaPed) | BUG | NO ES BUG | Flujo empalme: cPacaAguaEnt es correcto |
| 2026-05-02 | Item 6 → nuevo requerimiento | — | P0-2 | Bloquear cierre si embarques abiertos |
