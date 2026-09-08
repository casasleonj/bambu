# Composición C4 — Modo edición del `PedidosWorkspace`

**Goal:** que **editar** un pedido existente use el `PedidosWorkspace` (bajo `NEXT_PUBLIC_PEDIDOS_V2` ON), sacando `pedido-form-unified` del camino de edición. Es el prerequisito de ingeniería directo de **Fase 10** (retiro del form legacy).

**Estado previo:** C1/C1b/C2/C3 mergeadas (#225/#226/#228). El workspace cubre **crear** (`pedidos-client:1856`, `hubMode && !pedidoInicial`). `pedido-form-unified` sigue obligatorio para **editar** (`pedidos-client:2420`, siempre) y para **crear con flag OFF** (`:1864`).

---

## Contexto (investigación, 2026-09-08)

- El PUT `/api/pedidos/[id]` (`ActualizarPedidoUseCase`) es **declarativo** y solo acepta `items`, `obs`, `actualizarCliente`, `direccionEntrega`, `barrioEntrega`. **cliente / negocio / canal / origen son inmutables en edición** (confirmado en `pedido-context-panel.tsx`: "editar un pedido existente NUNCA puede cambiar su negocioId").
- El PUT **recalcula todo** server-side: `total`, `saldo = max(0, nuevoTotal − totalPagadoActual)`, `estadoPago = EstadoPagoVO.proyectar(nuevoTotal, totalPagadoActual, estadoEntrega)`, rebuild de items preservando precios salvo override manual, sync de `Factura`. Backend = autoridad (G8).
- `PreviewPedidoUseCase` hoy asume **creación**: `totalPagado` sale de `input.pagos`. En edición no se re-mandan pagos → asumiría `0` → `saldoProyectado` / `estadoPagoProyectado` engañosos.
- `handlePedidoSubmit` (`pedidos-client:912`) ya bifurca en `data.isEdit && data.pedidoId` → `fetch PUT` con ese body reducido. `PedidoUnifiedData` ya tiene `isEdit?` / `pedidoId?`.
- `PedidoContextPanel` ya tiene `pedidoInicialId?` → pone `NegocioSelector` en `readOnly`.

---

## Slicing (mismo criterio de riesgo que Fase 3 / Composición — la captura maneja dinero real)

### C4-i — backend: preview soporta edición

**Files:**
- Modify: `src/lib/validators.ts` (`PreviewPedidoSchema`)
- Modify: `src/modules/pedidos/application/dto/index.ts` (`PreviewPedidoInput`, `PreviewPedidoResult.allowedActions`)
- Modify: `src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts`
- Modify: `src/app/api/pedidos/preview/route.ts` (mapear `PEDIDO_NOT_FOUND` → 404)
- Modify: `docs/pedidos/02-api-contract-pedidos.md`
- Test: `src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase*.test.ts`, `src/app/api/pedidos/preview/__tests__/route.test.ts`

**Cambios:**
1. `PreviewPedidoSchema`: `pedidoId: z.string().trim().min(1).optional()`.
2. `PreviewPedidoInput`: `pedidoId?: string`.
3. `PreviewPedidoResult.allowedActions`: `Array<'crear' | 'crear-y-enviar-a-ruta' | 'actualizar'>`.
4. `PreviewPedidoUseCase.execute`: si `input.pedidoId`:
   - `const existente = await pedidoRepo.findById(PedidoId.from(input.pedidoId))`; si no → `PedidoNotFoundError` (nueva clase, `PEDIDO_NOT_FOUND: <id>`).
   - `esEdicion = true`. `totalPagadoBase = Number(existente.totalPagado)` (o el getter equivalente del entity).
   - **pagos**: en edición se ignora `input.pagos`; `totalPagado = totalPagadoBase`, `pagosAplicados`/`excedente` NO se recalculan desde `input.pagos` (el saldo a favor no cambia en un PUT declarativo de items).
   - **fiado**: `if (esEdicion) skip` — editar no crea un nuevo fiado (el guard de límite es para altas).
   - **riesgo**: se mantiene igual (cambiar precio/cantidad en un pedido existente ES un vector: `CAMBIO_PRECIO_BRUSCO`, `PRECIO_POR_DEBAJO_TABLA`). El historial excluye el propio `pedidoId` para no auto-compararse.
   - `allowedActions`: `esEdicion ? (canCreate ? ['actualizar'] : []) : [...]`. `canCreate` se renombra mentalmente a "canProceed" pero se deja el nombre.
   - `auditPreview.accion`: `esEdicion ? 'ACTUALIZAR_PEDIDO' : 'CREAR_PEDIDO'`.
5. Route: `catch` de `PedidoNotFoundError` → `apiError('Pedido no encontrado', 404)`.

**Tests:**
- unit: con `pedidoId` de un pedido con `totalPagado > 0` → `saldoProyectado` usa ese `totalPagado`, no `0`; `allowedActions === ['actualizar']`; sin fiado warning aunque el cliente esté al límite.
- unit: `pedidoId` inexistente → `PedidoNotFoundError`.
- integración: `preview({pedidoId})` con items nuevos == estado del pedido tras `PUT` con esos items (campo a campo: `total`, `saldo`, `estadoPago`).

**Commit:** `feat(pedidos): preview soporta edición (pedidoId) — Composición C4-i`

### C4-ii — frontend: `PedidosWorkspace` modo edición

**Files:**
- Modify: `src/components/pedido-workspace/types.ts` (`WorkspacePhase` sin cambios; `DraftPedido` sin cambios), `workspace-reducer.ts` (`initWorkspace` ya acepta `Partial<DraftPedido>`), `use-preview.ts` (mandar `pedidoId`), `pedido-commit-bar.tsx` (label), `index.tsx`
- Modify: `src/app/(app)/pedidos/pedidos-client/index.tsx` (`:2420` wire)
- Test: `src/components/pedido-workspace/__tests__/index.test.tsx`, `use-preview.test.ts`

**Cambios:**
1. `PedidosWorkspaceProps`: `pedidoInicial?: { id: string; clienteId: string; clienteNombre: string; negocioId: string | null; canal; items: Array<{ producto; cantidad; precioManual? }>; obs?; direccionEntrega?; barrioEntrega? }` (shape mínima, derivada de `pedidoEditando` en `pedidos-client`).
2. `index.tsx`:
   - `const modoEdicion = Boolean(pedidoInicial)`.
   - initializer del reducer: cuando `pedidoInicial`, arma el `DraftPedido` con sus items/canal/negocio/obs/direccion + `clienteId`.
   - `useClienteContext` sigue igual (carga fiado/patrón del cliente pinneado — el banner de fiado es informativo, no bloquea la edición).
   - **`PedidoContextPanel`**: en `modoEdicion` se muestra el cliente pinneado (sin buscador, sin "quitar", sin "cliente nuevo"), `pedidoInicialId={pedidoInicial.id}` (negocio readOnly), canal fijo (sin toggle). `PedidoProposal` NO se muestra (`!modoEdicion && ...`).
   - `usePreview(state.draft, ..., { pedidoId: modoEdicion ? pedidoInicial.id : undefined })`.
   - `canCommit`: `preview.allowedActions.includes(modoEdicion ? 'actualizar' : 'crear')`.
   - `PedidoCommitBar`: prop `modoEdicion` → label `Guardar cambios` / `Guardando…`.
   - `handleCommit`: en `modoEdicion` emite `{ isEdit: true, pedidoId: pedidoInicial.id, items, obs, actualizarCliente, direccionEntrega, barrioEntrega, canal, clienteId, origen }` (los últimos 3 los ignora el PUT pero `PedidoUnifiedData` los pide).
3. `use-preview.ts`: `usePreview(draft, cb, opts?: { pedidoId?: string })` → `toRequestBody` incluye `pedidoId`. El `key` de estabilidad lo incorpora.
4. `workspace-reducer`: `ACKNOWLEDGE_REVIEW` / REVIEW igual (un edit con `CAMBIO_PRECIO_BRUSCO` de severidad ALTA podría requerir revisión el día que la política exista).
5. `pedidos-client:2420`: `{hubMode ? <PedidosWorkspace pedidoInicial={{...pedidoEditando...}} onSubmit={handlePedidoSubmit} onCancel={() => setPedidoEditando(null)} /> : <PedidoFormUnified .../>}`.

**Tests:**
- unit: montar con `pedidoInicial` → items precargados, sin buscador de cliente, commit dice "Guardar cambios", `onSubmit` con `isEdit: true` + `pedidoId`.
- unit: cambio de cantidad → nuevo preview con `pedidoId` → commit habilitado.
- Playwright en vivo (worktree aislado, ver `multiples-sesiones-mismo-working-directory`): abrir "Editar Pedido" de un pedido real → cambiar cantidad → "Guardar cambios" → pedido actualizado.

**Commit:** `feat(pedidos): PedidosWorkspace modo edición — Composición C4-ii`

---

## Fuera de alcance de C4 (no reabrir)

- **Fase 10** (retiro de `pedido-form-unified`): requiere C4 + flip del flag a ON por defecto + soak period. Decisión de producto.
- Captura de venta libre / modo repartidor (§8.3 del blueprint, PENDIENTE).
- Cambiar cliente/negocio/canal de un pedido existente (el backend no lo permite; no se agrega).
- Fases 5-9 del blueprint (N2 en flujo, G11, relación cruzada, Recurrentes) — trabajo paralelo, no bloquea C4.
