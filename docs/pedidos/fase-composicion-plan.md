# Fase Composición — `PedidosWorkspace` (captura rediseñada) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o superpowers:executing-plans, tarea por tarea. Steps con checkbox (`- [ ]`).

**Goal:** Que la captura de pedido deje de ser un **formulario** (`pedido-form-unified/index.tsx`, 1045 líneas, 28 `useState`, `resolverPrecios` client-side) y pase a ser un **workspace adaptativo**: `intención → contexto → propuesta del sistema → ajuste mínimo → revisión (solo si hace falta) → confirmación`. El backend (`POST /api/pedidos/preview`, ya en `main`) es la autoridad de cálculo/riesgo/acciones; el workspace **muestra y compone**, no recalcula.

**Autoridad:** blueprint §3.2 (workspace adaptativo), §3.3 (reducer/orquestador de estado efímero — **NO** 2ª máquina de estados de negocio), §5.3 (riesgo en el flujo); ALS §4 (zonas), §6 (state machine de UI), §10 (flujo de acción sensible), §8 (`ValueOrigin`), §14 (anti-fraud UX), §22 (criterio final). Gates: **G1** (no formulario monolítico), **G3** (repetir no reintroduce datos conocidos), **G7** (sin reglas de negocio en frontend), **G8** (preview/commit separados; autorización cuando la política lo pide).

**Detrás de `NEXT_PUBLIC_PEDIDOS_V2`** (OFF). Con el flag OFF: `PedidoFormUnified` actual intacto. El retiro de `pedido-form-unified` es **Fase 10**, no esta fase.

## Ronda 1 — hallazgos (main, 2026-09-07)

- `pedido-form-unified/index.tsx` (1045 líneas): 28 `useState` (canal, cantidades, cliente, negocio, nuevoCliente, pagos, preciosResueltos/Origen/Manuales, tablaPrecios, observaciones, editDireccion/Barrio, soloParaEstePedido, entregarDespues, fiadosStatus, sugerenciaConsumo…). `resolverPrecios` (debounce ~400ms → `POST /api/precios/resolver`). `onSubmit(PedidoUnifiedData)` → `pedidos-client` → `useCrearPedido.create` → `fetchResilient('/api/pedidos', { offlineId })`.
- Los 3 componentes de Fase 3 (`PedidoContextPanel` 317 líneas, `PedidoItemEditor` 155, `PedidoPricingSummary` 72) son **puramente presentacionales** (patrón "lift state up" de 3b/3c): ~30 props cada uno, cero estado propio. **Se reusan tal cual** — el workspace se convierte en el nuevo dueño del estado.
- La captura se abre en el modal `showModal || showVentaRapida` de `pedidos-client` (líneas ~1834+), con `<PedidoFormUnified>` cargado por `dynamic()`.
- `POST /api/pedidos/preview` (en `main`) devuelve `{ calculation, permissions, allowedActions, warnings, riskSignals, requiresAuthorization, auditPreview }`. `requiresAuthorization` es SIEMPRE `false` hoy (política de umbral = PENDIENTE §8.2). Alcance: `origen ∈ {PEDIDO, VENTA_RAPIDA}`.
- `useCrearPedido` ya genera `offlineId` y usa `fetchResilient`. El commit real revalida todo.

## Slicing (mismo criterio de riesgo que Fase 3a/3b/3c — la captura maneja dinero real)

| Slice | Qué | PR |
|---|---|---|
| **C1** | `PedidosWorkspace` shell + `workspaceReducer` (estado efímero + máquina de UI adaptativa) + wire de `POST /api/pedidos/preview` para el cálculo. Reusa los 3 componentes de Fase 3. Flujo "crear desde cero". `PedidoPricingSummary` muestra el número del **preview**, no el `resolverPrecios` client-side. | C1 |
| **C2** | `PedidoRiskSignals` (consume `preview.warnings` + `preview.riskSignals`) en el workspace · `PedidoProposal` (flujo "Repetir": `PatronConsumo` de `GET /api/clientes/[id]` + última operación válida + `PlantillaRecurrente`; cada valor con su `ValueOrigin`). | C2 |
| **C3** | `PedidoReview` + `PedidoCommitBar` de representación adaptativa (sticky/contextual/integrada según viewport y estado) + flujo de acción sensible (`INTENT → PREVIEW → IMPACT → AUTHORIZATION → COMMIT`) — **solo** cuando una regla de riesgo / política lo exige. Hoy: solo el reconocimiento de precio manual con motivo (sin umbral). | C3 |
| **Fase 10** | retiro de `pedido-form-unified` cuando el workspace lo cubra por completo. | — |

---

## C1 — `PedidosWorkspace` + reducer + preview

### File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/components/pedido-workspace/workspace-reducer.ts` | reducer del **estado efímero** de la experiencia (draft, zona visible, estado de la máquina de UI, value origins). **No** reglas de negocio. | Create |
| `src/components/pedido-workspace/use-preview.ts` | hook: debounce del draft → `POST /api/pedidos/preview` → `{ calculation, warnings, riskSignals, allowedActions, requiresAuthorization }`; abort en cambios rápidos; `ResilientResult`-like para offline | Create |
| `src/components/pedido-workspace/index.tsx` | `PedidosWorkspace` — orquesta: dispatch del reducer, `usePreview`, compone `PedidoContextPanel` + `PedidoItemEditor` + `PedidoPricingSummary`, `PedidoCommitBar` mínimo | Create |
| `src/components/pedido-workspace/types.ts` | tipos del workspace (`WorkspaceState`, `WorkspaceAction`, `DraftPedido`) | Create |
| `src/components/pedido-workspace/__tests__/workspace-reducer.test.ts` | transiciones de la máquina de UI (adaptativa), value origins, sin lógica de negocio | Create |
| `src/components/pedido-workspace/__tests__/use-preview.test.ts` | debounce, abort, mapea la respuesta, offline | Create |
| `src/components/pedido-workspace/__tests__/index.test.tsx` | compone las 3 zonas; el total viene del preview; commit llama onSubmit con el payload correcto | Create |
| `src/app/(app)/pedidos/pedidos-client/index.tsx` | en hubMode, el modal de creación monta `<PedidosWorkspace>` en vez de `<PedidoFormUnified>` | Modify |
| `e2e/pedidos-hub.spec.ts` | + crear pedido desde el workspace (flag ON): total del preview, commit | Modify |
| `docs/pedidos/02-api-contract-pedidos.md` / `03-blueprint-experiencia-hub.md` | §7 Composición C1 ✅ | Modify |

### Task 1: `workspace-reducer.ts` — máquina de UI adaptativa (estado efímero)

- [ ] **Step 1: Tests** (`workspace-reducer.test.ts`):

```ts
// La máquina de UI de la ALS §6 es la RUTA MÁXIMA. El reducer la implementa
// adaptativa: para una operación normal salta REVIEW_REQUIRED /
// AUTHORIZATION_REQUIRED. NO contiene reglas de negocio (precio, límites,
// transiciones) — solo estado efímero de la experiencia.
//
// Estados: EMPTY → CONTEXT_READY → DRAFTING → PREVIEW_READY
//          → (REVIEW_REQUIRED → AUTHORIZATION_REQUIRED)?  → COMMITTING → COMMITTED
// Errores: VALIDATION_ERROR | CONFLICT_ERROR | NETWORK_ERROR | AUTHORIZATION_ERROR
//
// Casos:
// - SET_CLIENTE cuando EMPTY → CONTEXT_READY (o directo si venía precargado)
// - SET_ITEMS con al menos 1 → DRAFTING
// - PREVIEW_RECEIVED (sin warnings bloqueantes, requiresAuthorization=false) → PREVIEW_READY
// - COMMIT desde PREVIEW_READY (allowedActions incluye 'crear') → COMMITTING
// - PREVIEW_RECEIVED con requiresAuthorization=true → REVIEW_REQUIRED
// - COMMIT_CONFLICT (409) → CONFLICT_ERROR con recovery a PREVIEW_READY tras refresh
// - value origin: al aplicar una sugerencia, el campo queda { value, origin: 'HISTORY' }
// - un cambio de item tras PREVIEW_READY vuelve a DRAFTING (el preview quedó stale)
```

- [ ] **Step 2: Run → fail. Step 3: Implementar** el reducer. `WorkspaceState = { phase, draft, valueOrigins, preview, error }`. Acciones puras. **Ninguna** rama consulta pricing/límites/transiciones — esas viven en el preview (backend) y llegan por `PREVIEW_RECEIVED`.

- [ ] **Step 4: Run → pass. Step 5: Commit.**

```bash
git commit -m "feat(pedidos): workspace-reducer — máquina de UI adaptativa (estado efímero, sin reglas de negocio)"
```

### Task 2: `use-preview.ts`

- [ ] **Step 1: Tests** — debounce ~400ms del draft; `POST /api/pedidos/preview` con el subconjunto correcto; abort del request anterior si el draft cambia; mapea `{ calculation, warnings, riskSignals, allowedActions, requiresAuthorization }`; offline → estado `offline` sin romper (el draft local persiste, ALS §13).

- [ ] **Step 2–3: Implementar** — mismo patrón de abort/requestId que `usePedidos`/`use-peek`. Fetch plano (lectura). El draft → request se arma con `clienteId, negocioId, canal, origen, items, pagos, entregado, pedidoOrigenId`.

- [ ] **Step 4–5: Run + Commit.**

```bash
git commit -m "feat(pedidos): use-preview — debounce del draft → POST /api/pedidos/preview con abort"
```

### Task 3: `PedidosWorkspace` (index.tsx)

- [ ] **Step 1: Tests** (`index.test.tsx`):
  - monta las 3 zonas (`PedidoContextPanel`, `PedidoItemEditor`, `PedidoPricingSummary`).
  - `PedidoPricingSummary` recibe el `total`/`subtotal`/`recargoDomicilio` del **preview** (no de un `resolverPrecios` client-side).
  - operación normal: sin zona de Revisión (flujo `intención → propuesta → confirmar`).
  - commit → `onSubmit` con `{ clienteId, canal, origen, items, pagos, ... }` (mismo shape que consume `useCrearPedido`).
  - **G1**: el árbol no es un `<form>` con `if`s — son zonas que aparecen por `state.phase`.

- [ ] **Step 2–3: Implementar.**
  - `useReducer(workspaceReducer, initialState)`.
  - `usePreview(draft)` → dispatch `PREVIEW_RECEIVED`.
  - Zonas renderizadas según `state.phase`:
    - Contexto: siempre (`PedidoContextPanel` con props derivadas del `draft` + callbacks que hacen `dispatch`).
    - Operación: siempre (`PedidoItemEditor`).
    - Cálculo: siempre (`PedidoPricingSummary` con `state.preview.calculation`).
    - Commit: `PedidoCommitBar` mínimo (botón "Crear pedido $X" habilitado si `allowedActions.includes('crear')`).
  - **El estado de fiado / patrón de consumo**: en C1 se mantiene el fetch que ya hace `pedido-form-unified` (fiado-status, `GET /api/clientes/[id]`) — se mueve al workspace tal cual, sin relocalizar la lógica (patrón "lift state up" de 3b: el estado y los efectos van al workspace, los componentes siguen recibiendo props).

- [ ] **Step 4: `npx tsc --noEmit && npm run test -- src/components/pedido-workspace`. Step 5: Commit.**

```bash
git commit -m "feat(pedidos): PedidosWorkspace — compone las 3 zonas de Fase 3 con el reducer + preview del backend"
```

### Task 4: Wire en el modal de creación (hubMode)

- [ ] **Step 1:** `pedidos-client/index.tsx` — en el `<Modal open={showModal || showVentaRapida}>`, cuando `hubMode`, renderizar `<PedidosWorkspace onSubmit={...} intent={showVentaRapida ? 'venta-rapida' : 'pedido'} />` en vez de `<PedidoFormUnified>`. El `onSubmit` existente (que llama `useCrearPedido`) se reutiliza sin cambios. Con flag OFF: `<PedidoFormUnified>` intacto.

- [ ] **Step 2:** `npx tsc --noEmit && npm run test -- src/app/\(app\)/pedidos` (flag OFF = 0 regresiones).

- [ ] **Step 3: Verificación en vivo** (flag ON temporal en `.env`, restaurar después): abrir "Nueva operación", elegir cliente, agregar productos → el total se actualiza (viene del preview) → crear → el pedido aparece en la lista. Screenshot.

- [ ] **Step 4: Commit.**

```bash
git commit -m "feat(pedidos): el modal de creación monta PedidosWorkspace en hubMode (PedidoFormUnified solo con flag OFF)"
```

### Task 5: E2E + verificación + docs

- [ ] **Step 1:** `e2e/pedidos-hub.spec.ts` (flag ON): crear un pedido desde el workspace — elegir cliente, agregar producto, verificar que el total mostrado coincide con lo que persiste el commit, verificar que aparece en la lista.
- [ ] **Step 2:** Verificación completa (`tsc`, `npm run test`, integración, `eslint`).
- [ ] **Step 3: Gates C1:**

| Gate | Verificación |
|---|---|
| G1 | inspección: `PedidosWorkspace` son zonas por `state.phase`, no un `<form>` con ramas |
| G7 | `grep`: el workspace/reducer no importan `pricing`/`resolverLimiteFiados`/`pedido-transitions`; el cálculo llega por `usePreview` |
| G8 (parcial) | preview y commit son llamadas separadas; el commit revalida |

- [ ] **Step 4:** docs (`03-blueprint-experiencia-hub.md` §7 Composición C1 ✅). **Step 5: Commit + push + PR** (`feat/pedidos-workspace-c1` → `main`).

---

## C2 — `PedidoRiskSignals` + `PedidoProposal` (outline; plan detallado al ejecutar)

- `PedidoRiskSignals`: consume `preview.warnings` (FIADO_SOBRE_LIMITE, CLIENTE_BLOQUEADO, DIRECCION_FALTANTE, PRECIO_MANUAL_APLICADO) + `preview.riskSignals` (de `calcularAlertasCliente`). Presenta *qué se detectó · por qué importa · qué puede hacer* (ALS §14). **Señal ≠ bloqueo**: solo `warnings` que quitan `'crear'` de `allowedActions` bloquean, y eso lo decide el backend.
- `PedidoProposal`: el flujo "Repetir" (intención 3). Desde el peek del cliente o el intent picker → arma el draft desde `PatronConsumo` + última operación válida + `PlantillaRecurrente`; cada valor con `ValueOrigin` (`HISTORY`/`RULE`/`CALCULATION`); `[Confirmar] [Ajustar]`. "Ajustar" → abre el workspace completo precargado. **G3**: contar campos con input manual == 0 para un cliente con patrón.

## C3 — `PedidoReview` + `PedidoCommitBar` adaptativo + acción sensible (outline)

- `PedidoCommitBar`: el **estado de commit** disponible siempre que la operación sea válida; la **representación** se adapta (sticky en mobile, integrada en desktop, contextual según `state.phase`). No es una barra permanente obligatoria.
- `PedidoReview` + flujo `INTENT → PREVIEW → IMPACT → AUTHORIZATION → COMMIT`: se inserta **solo** cuando `preview.requiresAuthorization === true` (hoy nunca) o cuando la regla de riesgo de un precio manual pide reconocimiento + motivo. Hasta que exista la política de umbral (§8.2 PENDIENTE DE NEGOCIO): precio manual → `PedidoRiskSignals` con motivo obligatorio, sin bloqueo.
- Abuse paths (ALS §18): precio manipulado entre preview y commit → el commit revalida; salto de fase → el reducer no permite `COMMIT` fuera de `PREVIEW_READY`/`REVIEW_REQUIRED` resuelto.

---

## Self-Review (C1)

**Cobertura del blueprint:**
- §3.2 zonas adaptativas → Task 3.
- §3.3 reducer de estado efímero, NO 2ª máquina de negocio → Task 1 (test explícito: el reducer no consulta pricing/límites).
- §4.1 preview como contrato → Task 2.
- §22 "qué quiero hacer" no "qué campos lleno" → el workspace arranca del intent, el preview arma el cálculo.

**Riesgo (la captura maneja dinero):** C1 **no relocaliza** la lógica de fiado/patrón de consumo — la mueve al workspace con el patrón "lift state up" ya probado en 3b/3c (estado + efectos al padre, componentes reciben props). El `resolverPrecios` client-side se **reemplaza** por `usePreview` (el backend), lo que es un cambio de comportamiento *deseado* y verificable (Task 5 Step 1: total del preview == total del commit).

**Fuera de alcance de C1 (no reabrir):** riesgo en el flujo (C2), review/autorización (C3), retiro del form legacy (Fase 10), captura de venta libre / modo repartidor (§8.3 PENDIENTE).

**Micro-verificaciones del implementador:** shape exacto de `PedidoUnifiedData`/`CrearPedidoPayload`; props exactas de los 3 componentes de Fase 3; cómo `pedido-form-unified` hace el fetch de fiado-status y patrón de consumo (para moverlo tal cual).
