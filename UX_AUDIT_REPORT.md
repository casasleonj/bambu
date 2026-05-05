# UX/QA Audit Report — Agua Bambu v2

**Date**: 2026-05-04 | **Auditor**: QA Lead + Senior UX Auditor | **Stack**: Next.js 16, shadcn/ui, Tailwind v4, PWA, Dexie

---

## Resumen Ejecutivo

**Una app con buena base (PWA, offline-first, navegación clara, formularios funcionales) pero con bugs de UX que frustrarían a usuarios reales en 2G rural colombiano: el SW tiene implementación duplicada que causa doble reload, 8 confirmaciones usan `confirm()` nativo en vez del Modal propio, y el formulario de venta rápida no permite submit por Enter.** Los formularios están bien validados pero los errores no indican qué campo falló. La accesibilidad es baja: sin labels en múltiples componentes, sin focus trap en modales custom, y el indicador de conectividad es invisible para lectores de pantalla.

**Estado general de UX**: Sólida para uso interno con entrenamiento. Frustrante sin onboarding. Inaccesible para lectores de pantalla.

---

## Score Ponderado

| Dimensión | Peso | Score /10 |
|-----------|------|-----------|
| First Impression / Onboarding | 15% | 6/10 |
| Formularios y Inputs | 20% | 6/10 |
| Navegación y Flujos | 15% | 7/10 |
| Feedback y Estados | 15% | 6/10 |
| Mobile + PWA Experience | 15% | 5/10 |
| Consistencia y Pulido | 10% | 5/10 |
| Performance Percibida | 5% | 7/10 |
| Accesibilidad Básica | 5% | 3/10 |
| **TOTAL** | 100% | **5.85/10** |

---

## Paso 0 — Inventario de Interfaz

| Página/Ruta | Componentes clave | Flujos | Rol(es) |
|-------------|------------------|--------|---------|
| `/login` | `LoginForm` | Autenticación | Público |
| `/dashboard` | `DashboardClient`, KPIs, alertas, gráfico, tabla ventas | Vista general | Todos |
| `/pedidos` | `PedidosClient`, `PedidoForm`, `VentaRapidaForm`, tabla | CRUD pedidos | Admin, Asistente |
| `/clientes` | `ClientesClient`, `ClienteForm`, `ClienteTable` | CRUD clientes | Admin, Asistente |
| `/embarques` | `EmbarquesClient`, cards, modales crear/detalle | Gestión embarques | Admin, Repartidor |
| `/embarques/[id]/cerrar` | `CerrarEmbarqueClient`, `PedidoCuadre`, `VentaLibreRow` | Cierre de ruta | Admin, Repartidor |
| `/trabajadores` | `TrabajadoresClient`, cards, modal form | CRUD personal | Admin |
| `/precios` | `PreciosClient`, `VolumePriceCard` | Config precios | Admin |
| `/produccion` | `ProduccionClient`, stepper 3 pasos | Registro producción | Admin |
| `/cierre` | `CierreClient`, resumen, stock, caja | Cierre del día | Admin |
| `/facturas` | `FacturasClient`, filtros, lista, modal abono | Gestión cobranza | Admin, Contador |
| `/gastos` | `GastosClient`, form, lista | Registro gastos | Admin, Contador |
| `/nomina` | `NominaClient`, form, lista | Nómina | Admin, Contador |
| `/compras` | `ComprasClient`, form, lista | Compras insumos | Admin, Contador |
| `/insumos` | `InsumosClient`, form, cards | Inventario | Admin, Contador |
| `/proveedores` | `ProveedoresClient`, cards, modal form | CRUD proveedores | Admin, Contador |
| `/rutas` | `RutasClient`, `RutaForm`, lista | Rutas reparto | Admin |
| `/recurrentes` | `RecurrentesClient`, preview generación, cards | Pedidos automáticos | Admin, Contador |
| `/reportes` | `ReportesClient`, filtros, tabla | Reportes | Admin, Contador |

**Flujos core:**
1. Login → Dashboard → Crear pedido → Asignar a embarque → Cerrar embarque
2. Venta rápida en punto de venta (sin login complejo)
3. Cierre del día (Admin)
4. Gestión de clientes + precios especiales

**Roles**: ADMIN, ASISTENTE, CONTADOR, REPARTIDOR (vía User → Trabajador)

---

## Paso 1 — First Impression

- **Título y branding**: "Agua Bambú — Sistema de Gestión" visible en login ✅
- **CTA principal**: Botón "Ingresar" en login, claro ✅
- **Dashboard**: 4 KPIs + alertas + tabla + gráfico. Jerarquía visual clara ✅
- **Sidebar**: 18 items agrupados en 3 secciones (Operación, Finanzas, Administración). Abrumador para primer uso ❌ — sin colapsar secciones, sin favoritos.
- **Empty states**: Bien manejados con `EmptyState` component reutilizable ✅
- **Onboarding**: No existe. Usuario nuevo ve 18 links de sidebar sin guía ❌
- **Loading inicial**: Dashboard tiene skeleton, login tiene spinner. Resto inconsistente ⚠️

---

## Paso 2 — Elementos Interactivos

### 2.1 Sidebar y Navegación

| Hallazgo | Severidad | Archivo:Línea |
|----------|-----------|---------------|
| Links invisibles pero focusables cuando sidebar cerrado | 🔴 CRÍTICA | `app-shell.tsx:108-109` |
| Logout sin confirmación | 🟠 ALTA | `app-shell.tsx:152-161` |
| Sidebar sin `aria-label` | 🟠 ALTA | `app-shell.tsx:107` |
| Sin shortcut de teclado para sidebar | 🔵 BAJA | `app-shell.tsx` |
| Sidebar con `w-0 overflow-hidden` pero elementos en DOM | 🔴 CRÍTICA | `app-shell.tsx:108-109` |

### 2.2 Modales

| Hallazgo | Severidad | Archivo:Línea |
|----------|-----------|---------------|
| `Modal` tiene `title`/`description` props pero NO las renderiza | 🔴 CRÍTICA | `modal.tsx:12-13, 82-83` |
| `BaseCajaModal` no usa `<Modal>` — overlay manual sin ARIA | 🟠 ALTA | `base-caja-modal.tsx:80-82` |
| `BaseCajaModal` sin `<form>` — Enter no funciona | 🟡 MEDIA | `base-caja-modal.tsx:119-125` |
| `VentaRapidaForm` sin `<form>` — Enter no funciona | 🔴 CRÍTICA | `venta-rapida-form/index.tsx:294` |
| 8 `confirm()` nativos en vez del `Modal` propio | 🟠 ALTA | Varios archivos |
| Modal sin transición de entrada/salida | 🔵 BAJA | `modal.tsx` |
| `body { overflow: hidden }` causa layout shift | 🟡 MEDIA | `modal.tsx:49` |

---

## Paso 3 — Formularios

### 3.1 PedidoForm

| Hallazgo | Severidad |
|----------|-----------|
| Validación cliente bien: nombre, teléfono, al menos 1 producto ✅ |
| `catch` vacío en fetch de precios — sin toast | 🟡 MEDIA |
| Sin loading state en resolución de precios | 🟡 MEDIA |
| `parseInt` sin límite superior en cantidades | 🟡 MEDIA |
| Observaciones sin label | 🟡 MEDIA |
| Pago completo hardcodea EFECTIVO | 🟡 MEDIA |

### 3.2 VentaRapidaForm

| Hallazgo | Severidad |
|----------|-----------|
| Mensajes de error contextuales (sin cliente vs sin dirección) ✅ |
| Cambio de canal preserva cantidades ✅ |
| **No usa `<form>`** — sin submit por Enter | 🔴 CRÍTICA |
| `handleSubmit` sin guard de `submitting` al inicio | 🟡 MEDIA |
| Confirmar monto en blur — fácil confirmar por accidente en mobile | 🟡 MEDIA |
| "Nuevo:" debería ser "Cliente nuevo:" (typo) | 🔵 BAJA |
| `catch` vacío en `resolverPrecios` — sin toast | 🟡 MEDIA |

### 3.3 LoginForm

| Hallazgo | Severidad |
|----------|-----------|
| Toggle show/hide password con SVG ✅ |
| Loading state con "Ingresando..." ✅ |
| **Sin `autocomplete` en inputs** — password managers rotos | 🔴 CRÍTICA |
| **Sin `id`/`htmlFor`** — labels no asociados | 🟠 ALTA |
| Botón toggle sin `aria-label` | 🟠 ALTA |
| Error no asociado a campos con `aria-describedby` | 🟡 MEDIA |
| Sin `autoFocus` en campo usuario | 🟡 MEDIA |
| Sin rate limit visual | 🟡 MEDIA |

### 3.4 RutaForm

| Hallazgo | Severidad |
|----------|-----------|
| `type="time"` nativo para horarios ✅ |
| Toggle de días con feedback visual ✅ |
| **Labels sin `htmlFor` + inputs sin `id`** | 🟠 ALTA |
| Botones de días sin `aria-pressed` | 🟡 MEDIA |
| Sin validación de campos obligatorios en JS | 🟡 MEDIA |
| Sin indicador de carga para fetch de repartidores | 🟡 MEDIA |
| `console.error` en producción | 🔵 BAJA |

### 3.5 ClienteForm

| Hallazgo | Severidad |
|----------|-----------|
| Labels con `htmlFor` correctos ✅ |
| `type="tel"` activa teclado numérico ✅ |
| Error state visual ✅ |
| "Telefono" sin tilde → "Teléfono" | 🔵 BAJA |
| "Direccion" sin tilde → "Dirección" | 🔵 BAJA |
| "0 o vacio" → "0 o vacío" | 🔵 BAJA |
| Pills de precios sin `role="radiogroup"` | 🟡 MEDIA |

---

## Paso 4 — Navegación, Flujos y Browser Behavior

### 4.1 Flujos End-to-End

| Flujo | Estado | Problemas |
|-------|--------|-----------|
| Login → Dashboard | ✅ | Funciona bien |
| Dashboard → Crear Pedido → Pago | ✅ | Formulario completo |
| Pedido → Asignar Embarque → Cerrar | ✅ | Flujo más complejo, bien guiado |
| Cierre del día | ✅ | Con confirmación y lock |
| Venta rápida | ⚠️ | Enter no funciona (sin `<form>`) |

### 4.2 Back/Forward/Refresh

- App Router maneja navegación SPA. Back funciona. ✅
- Formularios pierden datos al navegar atrás. Ningún form usa `useFormState` o persiste estado. ❌

### 4.3 Multi-pestaña

- `useBaseCaja` usa localStorage + StorageEvent para sync cross-tab ⚠️
- Sin detección de sesión en otra pestaña

---

## Paso 5 — Estados y Feedback

### 5.1 Loading States

| Componente | Loading state | Archivo |
|------------|---------------|---------|
| Dashboard | Skeleton (Server) | `dashboard/loading.tsx` ✅ |
| App layout | Spinner mínimo | `(app)/loading.tsx` ⚠️ |
| Root layout | **No existe** | `loading.tsx` ausente ❌ |
| Tablas/Listas | Spinner inline | Varios ✅ |
| Resolución precios | **No tiene** | `pedido-form`, `venta-rapida-form` ❌ |
| Fetch de repartidores | **No tiene** | `ruta-form.tsx` ❌ |
| Sync offline | Spinner pequeño | `connectivity-indicator.tsx` ✅ |

### 5.2 Error States

| Componente | Error state |
|------------|-------------|
| API routes | `toast.error()` genérico ✅ |
| `(app)/error.tsx` | Styled con retry ✅ |
| Root `error.tsx` | **No existe** — login sin error boundary ❌ |
| `formatZodError` | **Pierde nombres de campos** — errores sin contexto ❌ |
| `catch` blocks | 5+ archivos con `catch(() => {})` vacío ❌ |
| `catch` en fetch de precios | Silencioso ❌ |

### 5.3 Success States

- Toast `sonner` consistente en 148+ usos ✅
- **Pero**: Login no tiene `<Toaster />` — errores de auth no tienen toast ❌

### 5.4 Confirmaciones

- 8 usos de `confirm()` nativo — no usa el `Modal` propio con focus trap ❌
- `Modal` tiene focus trap + Escape + click outside ✅

---

## Paso 6 — Mobile + PWA Experience

### 6.1 PWA

| Hallazgo | Severidad |
|----------|-----------|
| **SW duplicado**: `public/sw.js` + `src/app/sw.ts` compiten | 🔴 CRÍTICA |
| **Doble reload** por dos `controllerchange` listeners | 🔴 CRÍTICA |
| `manifest.json` con 8 íconos ✅ |
| `theme_color` (#0ea5e9) ≠ header (blue-600) | 🟡 MEDIA |
| Sin `screenshots` ni `categories` | 🔵 BAJA |
| Sin `shortcuts` para acceso rápido | 🔵 BAJA |
| `/offline` requiere Next.js server — no es HTML estático | 🟡 MEDIA |
| `STATIC_ASSETS` solo cachea `/` y `/offline` | 🟡 MEDIA |

### 6.2 Mobile/Touch

| Hallazgo | Severidad |
|----------|-----------|
| Header sin `safe-area-inset-top` — notch overlap | 🟡 MEDIA |
| Sidebar overlay oculta contenido pero es focusable | 🟡 MEDIA |
| `onBlur={confirmarMonto}` confirma pago al tocar fuera | 🟡 MEDIA |
| Sin `min-height` mínimo para inputs (iOS requiere 44px) | 🟡 MEDIA |
| `inputmode` no configurado en campos numéricos | 🔵 BAJA |

### 6.3 Conectividad

| Hallazgo | Severidad |
|----------|-----------|
| Indicador online/offline funcional ✅ |
| Sync automático al reconectar ✅ |
| Puramente visual — sin `role="status"` ni texto accesible | 🟠 ALTA |
| Sin toast al perder/recuperar conexión | 🟡 MEDIA |
| Interval de sync fijo 30s sin backoff | 🟡 MEDIA |

---

## Paso 7 — Consistencia y Pulido

### 7.1 Visual

| Hallazgo | Severidad |
|----------|-----------|
| Tailwind v4 + shadcn/ui consistente ✅ |
| `formatCurrency()` COP vs `$` + `.toLocaleString()` en varios files | 🟡 MEDIA |
| Emojis como iconos (🍶🧊🏭) — consistente ✅ |
| Sin dark mode — forzado `light` ✅ |
| Z-index sin sistema documentado | 🔵 BAJA |
| Sin variables CSS para colores de marca | 🔵 BAJA |

### 7.2 Ortografía y Textos

| String actual | Corrección | Archivo |
|---------------|------------|---------|
| `Telefono *` | `Teléfono *` | `cliente-form.tsx:74` |
| `Direccion` | `Dirección` | `cliente-form.tsx:117` |
| `0 o vacio` | `0 o vacío` | `cliente-form.tsx:140` |
| `Error de conexion` | `Error de conexión` | 5+ archivos |
| `Nuevo:` | `Cliente nuevo:` | `venta-rapida-form/index.tsx:279` |

---

## Paso 8 — Performance Percibida + PWA Feel

- **Se siente rápida en dev** (Turbopack HMR sub-segundo, Tailwind v4 JIT)
- Sin animaciones de entrada en modales → percepción de "saltos"
- Sin skeleton loaders en formularios (solo conectividad tiene skeleton-like)
- SW cache-first para estáticos da sensación de app nativa ✅
- Sin `stale-while-revalidate` en SW para assets → assets stale hasta nuevo deploy ⚠️

---

## Paso 9 — Accesibilidad

| Hallazgo | Severidad | WCAG |
|----------|-----------|------|
| Login sin labels asociados (`id`/`htmlFor`) | 🟠 ALTA | 1.3.1 |
| Login toggle password sin `aria-label` | 🟠 ALTA | 4.1.2 |
| Sidebar links focusables cuando invisible | 🔴 CRÍTICA | 2.4.3 |
| `BaseCajaModal` sin `role="dialog"` ni trap foco | 🟠 ALTA | 4.1.2 |
| Conectividad sin `role="status"` | 🟠 ALTA | 4.1.3 |
| RutaForm botones días sin `aria-pressed` | 🟡 MEDIA | 4.1.2 |
| `EmptyState` sin `role="status"` / `aria-live` | 🟡 MEDIA | 4.1.3 |
| Error de login no asociado con `aria-describedby` | 🟡 MEDIA | 1.3.1 |
| Sin `prefers-reduced-motion` | 🟡 MEDIA | 2.3.3 |
| Sin `:focus-visible` global | 🟡 MEDIA | 2.4.7 |
| ClienteForm pills sin `role="radiogroup"` | 🔵 BAJA | 4.1.2 |
| Headings correctos (h1-h2-h3) ✅ | — | 1.3.1 |

---

## Top 7 Acciones Inmediatas

| # | Acción | Severidad | Esfuerzo |
|---|--------|-----------|----------|
| 1 | **Eliminar SW duplicado** (`public/sw.js` O `src/app/sw.ts`) | 🔴 | 30 min |
| 2 | **Arreglar `VentaRapidaForm`** — envolver en `<form>`, agregar `onSubmit` | 🔴 | 15 min |
| 3 | **Arreglar sidebar focus trap** — `inert` o `visibility:hidden` cuando cerrado | 🔴 | 15 min |
| 4 | **Agregar `autocomplete` + labels al login** | 🔴 | 10 min |
| 5 | **Reemplazar 8 `confirm()` nativos** con el componente `Modal` | 🟠 | 1h |
| 6 | **Arreglar `Modal` `title`/`description`** — renderizar props en el DOM | 🔴 | 10 min |
| 7 | **Agregar `aria-label`** a conectividad, login toggle, sidebar | 🟠 | 20 min |

---

## Lo Que Está Bien Hecho

- **Emojis como iconos** — 0 requests de imagen, 0 CLS por imágenes ✅
- **Toast consistente con Sonner** — 148+ usos uniformes ✅
- **`EmptyState` reutilizable** con icono, título, descripción, acción ✅
- **`Modal` component con focus trap, Escape, click outside** ✅
- **Dashboard skeleton loading** en Server Component ✅
- **`formatCurrency()` COP** centralizado (aunque no usado en todos lados) ✅
- **Validación Zod en 100% de API routes** ✅
- **PWA con manifest completo, 8 íconos, standalone mode** ✅
- **Navegación agrupada semánticamente** (Operación/Finanzas/Administración) ✅
- **App Shell con `aria-current="page"`** en links activos ✅
- **Layout con `lang="es"`** correcto ✅

---

*Fin del reporte. 54 hallazgos. Los 7 críticos se arreglan en ~2.5h total.*
