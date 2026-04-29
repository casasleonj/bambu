# Sesión 2026-04-28 — Fixes, Features y Auditoría

## Commits realizados

| Commit | Descripción |
|--------|-------------|
| `7c458ff` | Fix: 5 bugs críticos |
| `5e33cd7` | Spec: diseño Venta Rápida |
| `69a4b96` | Feat: Venta Rápida + mejoras UX |
| `6f5ebc2` | Security: CSP + RBAC + auth + precios compartidos + E2E tests |
| `c1a5d6c` | UX: Sidebar sections + ARIA modals + touch targets + inline actions + search |

---

## 1. Fix: 5 Bugs Críticos

### Bug 1: Base caja no actualiza sidebar
- **Causa:** `BaseCajaModal` guardaba en localStorage pero no notificaba al layout
- **Fix:** Agregado `onSave` callback → `setBaseDia(val)` en layout

### Bug 2: Dashboard embarques activos vs embarques page vacío
- **Causa:** API retorna `{ data: [...] }` (paginado) pero páginas leían `.embarques`
- **Fix:** Fallback `|| data.data || []` en 13 setters across 6 páginas

### Bug 3: Modales no se cierran con Escape
- **Causa:** Modales eran `<div>` sin keyboard handlers
- **Fix:** Creado `<Modal>` reusable con Escape + backdrop click

### Bug 4: Búsqueda de cliente en PedidoForm vacía
- **Causa:** Fetch a `/api/clientes` sin `?all=true`
- **Fix:** URL cambiada a `/api/clientes?all=true`

### Bug 5: Precios no editables
- **Causa:** Form mostraba precio read-only, API resolver no soportaba batch
- **Fix:** API batch mode + `preciosManuales` state con input editable

---

## 2. Feature: Venta Rápida

### Componente `VentaRapidaForm`
- Botones +/- grandes (44x44px) para touch
- Toggle "¿Quiere envío a domicilio?"
- Si envío: crea/busca cliente vía `/api/clientes/quick`
- Pago asume monto completo (sin campo de monto)
- Cobrar en < 5 segundos (3 clicks)

### API changes
- `POST /api/clientes/quick` — crea cliente con datos mínimos
- `POST /api/pedidos` — maneja `tipo: 'MOSTRADOR'` → estado ENTREGADO
- Schema `ClienteQuickCreateSchema` en validators
- Cliente genérico `CLIENTE_MOSTRADOR` en seed

---

## 3. Auditoría de Seguridad

### Score: 4.9/10

| Dimensión | Score |
|-----------|-------|
| Seguridad | 5/10 |
| Arquitectura | 5/10 |
| Mantenibilidad | 4/10 |
| UX/Performance | 5/10 |
| Modelo de negocio | 6/10 |

### Fixes aplicados
- ✅ CSP header en `next.config.ts`
- ✅ `/api/clientes/quick` ahora requiere auth
- ✅ RBAC en middleware (redirige asistentes de páginas admin)
- ✅ `pg_advisory_lock` cast `::text` para Prisma 6.19
- ✅ Secuencias PostgreSQL creadas (`pedido_numero_seq`, etc.)

### Hallazgos pendientes (no críticos)
- Falta HSTS explícito
- Rate limit sin Redis = por instancia
- `Historial` model existe pero no se usa
- Sin code splitting (`next/dynamic`)

---

## 4. Mejoras UX

### Sidebar
- Agrupado en 3 secciones: Operación, Finanzas, Administración
- 15 iconos SVG (sin emojis)
- Mobile drawer con backdrop overlay
- `aria-label` en hamburger y logout

### Tabla de pedidos
- Tooltips en headers crípticos (`P.Ag` → "Paca Agua pedida")
- Búsqueda por número de pedido (`#pedido`)
- Acciones inline: "Enviar" para PENDIENTE sin abrir modal
- Vista responsive: tabla desktop / cards mobile

### Modal
- `role="dialog"`, `aria-modal="true"`
- Focus trap (Tab cicla dentro)
- Body scroll lock
- Botón cerrar con SVG ✕ (no texto "X")

### Touch targets
- +/- buttons: 44x44px (antes 36x36)
- Filter pills: 44px alto mínimo

---

## 5. Tests

### E2E nuevos (Playwright)
- `e2e/pedidos.spec.ts` — Venta rápida + venta con envío
- `e2e/facturas.spec.ts` — Page load + RBAC asistente
- 4/4 tests passing

---

## Archivos clave modificados

| Archivo | Cambios |
|---------|---------|
| `src/app/(app)/layout.tsx` | Sidebar sections, SVG icons, mobile drawer |
| `src/app/(app)/pedidos/page.tsx` | Venta Rápida modal, tooltips, inline actions, responsive cards |
| `src/components/modal.tsx` | Focus trap, ARIA, body scroll lock |
| `src/components/venta-rapida-form.tsx` | Componente nuevo |
| `src/components/pedido-form.tsx` | Precios editables, labels Producto/Precio/Cant. |
| `src/lib/prices.ts` | Constantes compartidas DEFAULT_PRICES, PRODUCTO_INFO |
| `src/lib/validators.ts` | ClienteQuickCreateSchema, ventaRapida field |
| `src/lib/locks.ts` | pg_advisory_lock cast ::text |
| `src/middleware.ts` | ADMIN_PAGE_ROUTES RBAC checks |
| `src/app/api/pedidos/route.ts` | tipo MOSTRADOR → ENTREGADO, ventaRapida handling |
| `src/app/api/clientes/quick/route.ts` | Nuevo endpoint |
| `prisma/seed.ts` | Cliente CLIENTE_MOSTRADOR |
| `next.config.ts` | CSP header |

---

## Estado post-sesión 29-abr

Los siguientes items fueron completados en la sesión del 29 de abril. Ver `bambu_demo_multimodelo-20260429-session.md` para detalles:

- ✅ HSTS + CSP tighten
- ✅ Audit trail (Historial model activado)
- ✅ CSRF protection
- ✅ E2E tests (cierre, embarques, producción)
- ✅ Code splitting con next/dynamic
- ✅ Embarques automáticos
- ✅ Dashboard: trends, alerts, hourly chart
- ✅ CRM recomendaciones predictivas
- ✅ Offline sync conflict resolution
- ✅ Login hydration fix
- ✅ SW dev unregistration
- ✅ Eliminar worktree feat-8-week-impl
- ✅ Cancelar embarques (estado CANCELADO)

## Próximos pasos sugeridos

1. **Run `npx prisma db push`** para aplicar enum CANCELADO
2. **Tests E2E** para cancelar embarque y recomendaciones CRM
3. **Voice search** para clientes en página de pedidos
4. **PWA install prompt** para usuarios rurales
