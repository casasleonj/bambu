# Fase 4b — Pedido Hub: peek/detalle contextual + command menu · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o superpowers:executing-plans, tarea por tarea. Steps con checkbox (`- [ ]`).

**Goal:** Reemplazar el modal de detalle legacy (`max-w-md`, se abre encima de la lista) por el **peek contextual** del blueprint: se abre **al lado** de la lista (desktop) o como **bottom sheet** (mobile), sin navegar; `↑/↓` recorren operaciones; carga por capas (capa 1 instantánea, capa 2 un fetch, capa 3 bajo demanda). Añadir el **command menu** contextual. Todo dentro de `NEXT_PUBLIC_PEDIDOS_V2`.

**Depende de:** Fase 4a (`feat/pedidos-hub-4a` / PR #223) mergeada a `main`. Esta rama parte de `main` con 4a incluida.

**Fuera de alcance de 4b** (Composición / fases siguientes): captura rediseñada (`PedidosWorkspace`), `PedidoRiskSignals`/`PedidoExceptionPanel` como flujo de acción (4b solo los **muestra** en el peek, la resolución sigue abriendo `caso-guia-modal`), N2/G11 ejecutables desde el peek (Fases 5/6), retiro de legacy (Fase 10).

**Autoridad:** blueprint §3.4 (peek por capas), §3.5 (acciones contextuales), §3.6 (command menu), §4.3 (carga del peek), §9.2 (BRECHA — `GET /api/pedidos/[id]` no incluye N2/relaciones). Gates: **G4** (info accesible desde el peek sin cambiar de ruta), **G7** (sin reglas en frontend), **G10** (Playwright).

**Ronda 1 — hallazgos (main, 2026-09-07):**
- `GET /api/pedidos/[id]` devuelve `{ pedido: { ...PedidoResumenDTO, factura, cliente/negocio enrichment } }`. **No** incluye: `ObligacionPendiente`/`Actividad` (N2), resumen del embarque (solo `embarqueId`), pedidos vinculados por `pedidoOrigenId`, casos abiertos, timeline.
- Schema: `Pedido.obligacion` (0-1 `ObligacionPendiente` con `@unique pedidoId`), `ObligacionPendiente.actividades: Actividad[]`, `Pedido.pedidoOrigen`/`pedidosRelacionados` (self-relation `"PedidoRelacionado"`, G11.B), `Pedido.casos: Caso[]` (`"CasoPedido"`), `Pedido.embarque` (`"PedidoEmbarqueActual"`).
- Detalle legacy: `pedidos-client/index.tsx` líneas ~1984–2316 — modal con total/pagado/pendiente, grid canal/fecha/hora/embarque, productos con diff de precio, stepper de estado + botones de acción por estado, factura+abonos con cross-links. `handleDetail(pedido)` lo abre + lazy-fetch de `GET /api/pedidos/[id]`.
- `caso-guia-modal.tsx` existe (resolución de `Caso`/disputa). `useRealtimeListener(filters, cb, {debounceMs})` existe. No hay `useMediaQuery` (4a usa `matchMedia` inline en `pedido-hub/index.tsx`).
- `panel-prefetch.ts` de `/clientes` es el patrón de caché para la capa 2 (TTL 60s / LRU 20, fetch plano, invalidación por realtime).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/app/api/pedidos/[id]/route.ts` | GET incluye `pendienteN2`, `embarqueResumen`, `pedidosVinculados`, `casosAbiertos` (aditivo) | Modify |
| `src/app/api/pedidos/[id]/__tests__/route-peek.test.ts` | shape del GET incluye los campos nuevos + auth | Create |
| `src/modules/pedidos/application/dto/index.ts` | `PedidoPeekDTO` (extiende `PedidoResumenDTO`) | Modify |
| `src/app/(app)/pedidos/pedido-hub/use-peek.ts` | hook: capa 1 (de la lista) + capa 2 (fetch con caché TTL/LRU + abort en navegación rápida) | Create |
| `src/app/(app)/pedidos/pedido-hub/peek-panel.tsx` | el panel: capa 1 + capa 2 + capa 3 (lazy) · desktop lado a lado / mobile bottom sheet | Create |
| `src/app/(app)/pedidos/pedido-hub/peek-relaciones.tsx` | sub-panel: embarque · factura · cartera · pedidos vinculados · pendiente N2 (acceso, no fusión) | Create |
| `src/app/(app)/pedidos/pedido-hub/command-menu.tsx` | `PedidoCommandMenu` — global (⌘/Ctrl+K) + contextual (por operación) | Create |
| `src/app/(app)/pedidos/pedido-hub/index.tsx` | wire peek + command menu + `↑/↓` | Modify |
| `src/app/(app)/pedidos/pedido-hub/operacion-list.tsx` | fila → `onOpen` abre el peek (no el modal); selección con teclado | Modify |
| `src/app/(app)/pedidos/pedidos-client/index.tsx` | en hubMode, `onOpen` = abrir peek (no `handleDetail`); el modal legacy solo para `!hubMode` | Modify |
| `src/app/(app)/pedidos/pedido-hub/__tests__/use-peek.test.ts` | capa 1 sin fetch · capa 2 cachea · abort en cambio rápido | Create |
| `src/app/(app)/pedidos/pedido-hub/__tests__/peek-panel.test.tsx` | capas · relaciones · responsive · acciones | Create |
| `src/app/(app)/pedidos/pedido-hub/__tests__/command-menu.test.tsx` | global + contextual · teclado · no ejecuta acciones sensibles | Create |
| `e2e/pedidos-hub.spec.ts` | + peek (abre sin navegar, `↑/↓`, offline), command menu | Modify |
| `docs/pedidos/02-api-contract-pedidos.md` | `GET /api/pedidos/[id]` shape extendido | Modify |
| `docs/pedidos/03-blueprint-experiencia-hub.md` | §9.2 resuelta, §7 Fase 4b ✅ | Modify |

---

## Task 1: Extender `GET /api/pedidos/[id]` (BRECHA §9.2)

**Files:** `src/app/api/pedidos/[id]/route.ts`, `src/modules/pedidos/application/dto/index.ts`, test.

- [ ] **Step 1: Write the failing test** (`route-peek.test.ts`, guardrail estático + shape)

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
const src = readFileSync(join(process.cwd(), 'src/app/api/pedidos/[id]/route.ts'), 'utf-8')

describe('GET /api/pedidos/[id] — peek (Fase 4b)', () => {
  it('el GET incluye pendienteN2 / embarqueResumen / pedidosVinculados / casosAbiertos', () => {
    expect(src).toMatch(/pendienteN2/)
    expect(src).toMatch(/embarqueResumen/)
    expect(src).toMatch(/pedidosVinculados/)
    expect(src).toMatch(/casosAbiertos/)
  })
  it('sigue exigiendo requireOwnership (no baja el guard)', () => {
    expect(src).toMatch(/requireOwnership\('pedido'/)
  })
  it('los datos nuevos son de LECTURA (no importa use cases de escritura ni $transaction en el GET)', () => {
    const getBlock = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function PUT'))
    expect(getBlock).not.toMatch(/\$transaction|actualizarPedidoUseCase|withAdvisoryLock/)
  })
})
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Añadir las queries de lectura** (dentro del `try` del GET, en el `Promise.all` existente):

```ts
const [obligacion, pedidosVinculados, casosAbiertos] = await Promise.all([
  prisma.obligacionPendiente.findUnique({
    where: { pedidoId: id },
    include: { actividades: { select: { id: true, tipo: true, cantidad: true, cantidadCumplida: true, estado: true, modo: true, embarqueId: true } } },
  }),
  prisma.pedido.findMany({
    where: { OR: [{ pedidoOrigenId: id }, ...(found.pedido.pedidoOrigenId ? [{ id: found.pedido.pedidoOrigenId }] : [])] },
    select: { id: true, numero: true, pedidoOrigenId: true, total: true, estadoEntrega: true },
  }),
  prisma.caso.findMany({
    where: { pedidoId: id, status: { in: ['ABIERTO', 'EN_PROCESO'] } },
    select: { id: true, alertaTipo: true, status: true, createdAt: true },
  }),
])

let embarqueResumen = null
if (found.pedido.embarqueId) {
  const e = await prisma.embarque.findUnique({
    where: { id: found.pedido.embarqueId },
    select: { id: true, numeroDia: true, estado: true, trabajador: { select: { nombre: true } } },
  })
  if (e) embarqueResumen = { id: e.id, numeroDia: e.numeroDia, estado: e.estado, repartidor: e.trabajador?.nombre ?? null }
}
```

Añadir al `apiSuccess({ pedido: {...} })`:

```ts
pendienteN2: obligacion
  ? { id: obligacion.id, producto: obligacion.producto, remanente: obligacion.cantidadOriginal - obligacion.cantidadCumplida, estado: obligacion.estado, actividades: obligacion.actividades }
  : null,
embarqueResumen,
pedidosVinculados: pedidosVinculados
  .filter(p => p.id !== id)
  .map(p => ({ id: p.id, numero: p.numero, rol: p.pedidoOrigenId === id ? 'demanda' : 'origen', total: Number(p.total), estadoEntrega: p.estadoEntrega })),
casosAbiertos: casosAbiertos.map(c => ({ id: c.id, alertaTipo: c.alertaTipo, status: c.status })),
```

DTO `PedidoPeekDTO` en `dto/index.ts` = `PedidoResumenDTO & { pendienteN2, embarqueResumen, pedidosVinculados, casosAbiertos }` con los tipos exactos.

- [ ] **Step 4: Run → pass. Step 5: smoke** (`curl /api/pedidos/<id>` con un pedido que tenga embarque). **Step 6: Contract doc. Step 7: Commit.**

```bash
git commit -m "feat(pedidos): GET /api/pedidos/[id] incluye N2 + relaciones para el peek (BRECHA §9.2)"
```

---

## Task 2: `use-peek.ts` — carga por capas con caché + abort

**Files:** `src/app/(app)/pedidos/pedido-hub/use-peek.ts`, test.

- [ ] **Step 1: Write the failing test** (`use-peek.test.ts`):

```ts
// capa 1 sale del pedido de la lista (0 fetch); capa 2 se cachea (TTL); un
// segundo open del mismo id no re-fetchea; cambiar de id aborta el fetch anterior.
```

Casos: `openPeek(pedido)` → `layer1 = pedido` inmediato, `layer2 = undefined`, dispara fetch. Segundo `openPeek(mismoPedido)` dentro del TTL → sin fetch. `openPeek(otro)` mientras el fetch previo está en vuelo → `AbortController.abort()` del anterior. Cache LRU cap 20.

- [ ] **Step 2: Run → fail. Step 3: Implementar** — patrón de `src/app/(app)/clientes/clientes-client/panel-prefetch.ts` (Map con `{ data, ts }`, TTL 60s, LRU 20, `AbortController` por request, `requestId` para descartar stale). Fetch plano a `GET /api/pedidos/[id]` (no `fetchResilient` — es lectura, se invalida por realtime). Invalidación: función `invalidatePeek(id)` que borra la entrada; el orquestador la llama en `pedido.updated`/`pago.created`/`embarque.updated` **solo si el id coincide** (§6.2 del blueprint).

- [ ] **Step 4: Run → pass. Step 5: Commit.**

```bash
git commit -m "feat(pedidos): use-peek — capa 1 instantánea + capa 2 con caché TTL/LRU + abort en navegación rápida"
```

---

## Task 3: `peek-panel.tsx` + `peek-relaciones.tsx`

**Files:** ambos + test `peek-panel.test.tsx`.

- [ ] **Step 1: Tests** — capa 1 visible sin fetch (cliente, estado legible, qué se pidió/entregó, total/saldo, acción destacada + `⋯`); capa 2 (desglose items con precio y origen *si permiso*, timeline, `PeekRelaciones`); capa 3 (`dynamic()`: auditoría, GPS/foto) solo al expandir; desktop = panel lateral (`data-testid="peek-desktop"`), mobile = bottom sheet (`peek-mobile`); `Escape` cierra; botón "abrir detalle completo" → `/pedidos/[id]` (deep-link sigue existiendo).

- [ ] **Step 2: Run → fail. Step 3: Implementar.**
  - `PeekPanel` recibe `{ pedido, peekData, onClose, onAccion, onNav }` (`onNav('prev'|'next')` para `↑/↓`).
  - `deriveOperacion` para el estado legible + acción destacada (reusa 4a).
  - `PeekRelaciones` (capa 2): filas de embarque (`→ Ver` al peek del embarque), factura (`→ /facturas?openFactura=`), cartera (`→ /cartera`, muestra **saldo del cliente** claramente distinto del **saldo de esta operación**), pedidos vinculados (`→ peek del vinculado`), pendiente N2 (`PedidoExceptionPanel` — solo muestra, la gestión es Fase 5). **Acceso, no fusión** (§6.2).
  - Precio-origen: oculto salvo permiso (`requirePermission('view:productos')` equivalente client-side — verificar cómo se expone el rol/permiso en el cliente, `grep useSession`/`usePermissions`).

- [ ] **Step 4: Run → pass. Step 5: Commit.**

```bash
git commit -m "feat(pedidos): PeekPanel + PeekRelaciones — detalle contextual por capas, acceso no fusión"
```

---

## Task 4: `command-menu.tsx`

**Files:** `command-menu.tsx`, test.

- [ ] **Step 1: Tests** — `⌘/Ctrl+K` abre el menú global (nueva operación, repetir pedido de…, buscar cliente…, **Abrir planificación de hoy** [navega, no ejecuta], ir a cartera); menú contextual sobre la operación seleccionada = sus acciones (`deriveOperacion` + secundarias); navegable 100% teclado (`↑/↓/Enter/Esc`), `role="dialog"` + `aria-activedescendant`; **no ejecuta operaciones sensibles** — "Anular #123" abre el flujo (modal), no muta.

- [ ] **Step 2: Run → fail. Step 3: Implementar** — sin librería (`cmdk` no está en `package.json`, verificado). Componente propio: input de filtro + lista de comandos + registro de shortcuts (`useEffect` con `keydown`, respeta `input`/`textarea` focus para no capturar). Global montado en `pedido-hub/index.tsx`; contextual anclado a la fila/peek activo.

- [ ] **Step 4: Run → pass. Step 5: Commit.**

```bash
git commit -m "feat(pedidos): PedidoCommandMenu — global (⌘K) + contextual, teclado, no ejecuta acciones sensibles"
```

---

## Task 5: Wire en el orquestador + lista + pedidos-client

**Files:** `pedido-hub/index.tsx`, `operacion-list.tsx`, `pedidos-client/index.tsx`.

- [ ] **Step 1:** `pedido-hub/index.tsx`:
  - estado `peekId: string | null` + `selectedIndex` (para `↑/↓`).
  - `openPeek(pedido)` (de `use-peek`); `↑/↓` cuando el peek está abierto → `onNav` mueve `selectedIndex` y re-`openPeek`.
  - realtime: en `pedido.updated`/`pago.created`/`embarque.updated`, `invalidatePeek(evt.id)` **solo si coincide**; refetch de la lista/counts como en 4a.
  - `<PeekPanel>` + `<PedidoCommandMenu>` montados.
  - desktop: layout 2 zonas (lista ~60% / peek ~40%) cuando el peek está abierto; mobile: bottom sheet sobre la lista.

- [ ] **Step 2:** `operacion-list.tsx`: la fila `onOpen` ya existe → ahora el orquestador la cablea a `openPeek` (no al modal). `Espacio` sobre la fila enfocada abre el peek. Selección con teclado (`↑/↓` mueven el foco de fila).

- [ ] **Step 3:** `pedidos-client/index.tsx`: en `hubMode`, `onOpen` = el `openPeek` del Hub (se pasa hacia arriba o el Hub lo maneja internamente). El modal de detalle legacy (`showDetailModal`) queda **solo para `!hubMode`**. Con el flag OFF: idéntico a hoy.

- [ ] **Step 4:** `npx tsc --noEmit && npm run test -- src/app/\(app\)/pedidos`. **Step 5: Commit.**

```bash
git commit -m "feat(pedidos): peek + command menu cableados en el Hub; modal legacy solo con flag OFF"
```

---

## Task 6: E2E + verificación + docs

- [ ] **Step 1:** `e2e/pedidos-hub.spec.ts` (bloque flag-ON): abrir peek desde una fila **sin navegar** (`page.url()` no cambia); `↑/↓` recorren y el peek actualiza; peek muestra relaciones (embarque link, factura link); `Escape` cierra; `⌘K` abre el command menu; offline: peek capa 1 sigue visible, capa 2 muestra "sin conexión". Responsive: `peek-desktop` vs `peek-mobile`.

- [ ] **Step 2:** Verificación completa:

```bash
npx tsc --noEmit
npm run test
npm run test -- --config vitest.integration.config.ts
npx eslint src/app/\(app\)/pedidos/pedido-hub src/app/api/pedidos/[id] --max-warnings 0
```

- [ ] **Step 3: Gates:**

| Gate | Verificación |
|---|---|
| G4 | E2E: crear/cobrar/planificar/resolver desde el peek sin `page.goto` intermedio |
| G7 | `grep`: peek deriva con `deriveOperacion`; el GET solo lee |
| G10 | specs de peek + command menu + offline + responsive |

- [ ] **Step 4:** `02-api-contract-pedidos.md` (`GET /api/pedidos/[id]` extendido), `03-blueprint-experiencia-hub.md` (§9.2 RESUELTA, §7 Fase 4b ✅). **Step 5: Commit + push + PR** (`feat/pedidos-hub-4b` → `main`).

---

## Self-Review

**Cobertura del blueprint:**
- §3.4 peek por capas → Tasks 2, 3.
- §3.5 acciones contextuales → Task 3 (`⋯`) + Task 4 (contextual).
- §3.6 command menu → Task 4.
- §3.7 "Abrir planificación de hoy" navega, no ejecuta → Task 4 (test explícito).
- §4.3 carga del peek (capa 1 sin fetch, capa 2 un fetch, `dynamic()` capa 3, abort en `↑/↓`) → Task 2.
- §6.2 relación = acceso no fusión; realtime invalidación selectiva; saldo-operación ≠ deuda-cliente → Task 3 + Task 5 Step 1.
- §9.2 BRECHA → Task 1.

**Fuera de alcance explícito (no reabrir en ejecución):** captura rediseñada, ejecución de N2/G11 desde el peek, retiro de legacy. El peek **muestra** N2/casos; su gestión sigue en `caso-guia-modal` / Fase 5.

**Micro-verificaciones del implementador:** nombre de la relación reverse de casos (`"CasoPedido"`), cómo el cliente expone rol/permiso para ocultar precio-origen, `Caso.status` valores exactos (`ABIERTO`/`EN_PROCESO`).
