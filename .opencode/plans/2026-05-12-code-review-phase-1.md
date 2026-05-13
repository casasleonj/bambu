# Fase 1 — Arquitectura + Performance

**Prioridad:** MÁXIMA  
**Basado en:** Code Review 2026-05-12 (7 fases)  
**Impacto:** Mantenibilidad, velocidad de desarrollo, rendimiento en 2G/3G

---

## A1. Refactor PedidosClient — romper monolito de 943 líneas

**Archivo:** `src/app/(app)/pedidos/pedidos-client/index.tsx`

**Problema:** 1 archivo maneja fetch de 4 APIs, 3 tabs, filtros URL, date nav, 4 modales, FAB speed-dial, polling, visibility change, badges, stepper visual, cálculo de promedios.

**Corrección:**
- Extraer a archivos separados en `pedidos-client/`:
  - `pedidos-state.ts` → lógica de estado, fetch, filtros, polling (hooks puros)
  - `pedidos-header.tsx` → título + date nav + tabs (ya separado parcialmente)
  - `pedidos-modals.tsx` → contenedor de modales (formulario, detalle, embarque)
  - `pedidos-fab.tsx` → FAB speed-dial
  - `pedidos-alertas.ts` → funciones `getAlertasPedido`, `calcularPromedioCliente` (hoy están DENTRO del componente)
- `pedidos-client/index.tsx` queda como orquestador (~200 líneas)

**Verificación:** `npx tsc --noEmit` + reload de página de pedidos

---

## A2. Dashboard con Suspense boundaries

**Archivo:** `src/app/(app)/dashboard/page.tsx`

**Problema:** 16 queries en un solo `Promise.all`. Pantalla en blanco hasta que todas resuelvan.

**Corrección:**
- Dividir dashboard en secciones independientes envueltas en `<Suspense>`:
  ```tsx
  <Suspense fallback={<SkeletonVentas />}>
    <VentasDelDia />
  </Suspense>
  <Suspense fallback={<SkeletonFiados />}>
    <FiadosAlertas />
  </Suspense>
  ```
- Cada sección hace sus propias queries (no comparten `Promise.all`)
- Crear `dashboard-server/` con secciones Server Component independientes

**Verificación:** Dashboard debe mostrar contenido progresivamente (no bloqueante)

---

## A3. Pass-through pages con prefetch SSR

**Archivo:** 10 páginas: `pedidos/page.tsx`, `embarques/page.tsx`, `produccion/page.tsx`, `recurrentes/page.tsx`, `cierre/page.tsx`, `gastos/page.tsx`, `facturas/page.tsx`, `compras/page.tsx`, `nomina/page.tsx`, `rutas/page.tsx`

**Problema:** Son wrappers vacíos `<ClienteComponent />`. Cliente descarga JS, monta React, recién ahí fetch API.

**Corrección:**
- Para cada una, agregar fetch inicial de datos resumidos en el SC y pasarlos como props serializadas
- Ejemplo `pedidos/page.tsx`:
  ```tsx
  const pedidosHoy = await prisma.pedido.findMany({
    where: { fecha: { gte: startOfDay, lt: endOfDay } },
    take: 50,
    orderBy: { fecha: 'desc' },
  })
  return <PedidosClient initialPedidos={JSON.parse(JSON.stringify(pedidosHoy))} />
  ```
- El cliente usa `initialPedidos` como estado inicial, refresca con fetch normal

**Verificación:** Las 10 páginas deben mostrar datos inmediatamente en el HTML inicial

---

## A4. Correcciones rápidas de Arquitectura

### A4a. Eliminar doble Providers

**Archivo:** `src/app/layout.tsx` y `src/app/(app)/layout.tsx`

El root layout ya envuelve en `<Providers>`. El app layout lo repite. Eliminar el `<Providers>` duplicado en `(app)/layout.tsx`.

### A4b. Mover headers() a Client Component (o eliminar async del root layout)

**Archivo:** `src/app/layout.tsx`

`await headers()` en el root layout fuerza que todo sea dinámico. El nonce se puede inyectar desde el proxy como `data-nonce` en el body, y leerlo desde un Client Component.

### A4c. Agregar unstable_instant a rutas principales

**Archivo:** todas las `page.tsx`

```tsx
export const unstable_instant = { prefetch: 'static' }
```

Docs Next.js 16: *"Suspense alone does not guarantee instant client-side navigations. Always export `unstable_instant` from routes."*

### A4d. Agregar `import 'server-only'` a módulos de servidor

**Archivos:** `src/lib/prisma.ts`, `src/lib/auth.ts`, `src/lib/rate-limit.ts`

Previene importación accidental en Client Components. Si alguien importa prisma en un CC, el build falla con error claro.

---

## A5. Performance: Polling y Code-Splitting

### A5a. Corregir intervalo de polling en pedidos-client

**Archivo:** `src/app/(app)/pedidos/pedidos-client/index.tsx:158`

Comentario dice "Poll every 60s" pero código usa `10000` (10 segundos). Cambiar a `60000`.

**Además:** Detener polling cuando `document.hidden` (ya existe visibility listener, pero el interval sigue corriendo).

### A5b. Agregar dynamic() a componentes pesados

**Archivo:** `src/app/(app)/pedidos/pedidos-client/index.tsx`

Solo 1 dynamic import en toda la app. Agregar:
- `dynamic(() => import('./pedido-table'), { ssr: false })`
- `dynamic(() => import('./fiados-table'), { ssr: false })`
- `dynamic(() => import('./alertas-table'), { ssr: false })`

Cada tabla pesa ~200+ líneas. No se necesita en el bundle inicial.

### A5c. Agregar navigation preload al Service Worker

**Archivo:** `public/sw.js`

```js
self.addEventListener('activate', (event) => {
  event.waitUntil(self.registration?.navigationPreload?.enable())
})
```

Request de navegación arranca en paralelo al boot del SW. Ahorra ~100-200ms por navegación.

---

## Verificación Fase 1

```bash
npx tsc --noEmit
npm run build
npm run test
```

