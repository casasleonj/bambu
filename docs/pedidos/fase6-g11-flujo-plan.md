# Fase 6 — G11: Corrección vs Nueva demanda en el flujo del Pedido Hub

> **For agentic workers:** implementación por slices (F6-0 → F6-i → F6-ii → F6-iii). TDD, commits frecuentes. Detrás de `NEXT_PUBLIC_PEDIDOS_V2` (OFF). **Base:** rama `feat/pedidos-fase5-n2` (PR #231) — F6 usa el `PedidoExceptionPanel` y `AccionKey` de F5. Rebasar sobre `main` cuando #231 mergee.

**Goal:** que ante un cambio en las cantidades de un pedido el usuario **declare la causa** (me equivoqué al capturar / el cliente pidió otra cosa), y que cada rama tenga su flujo correcto: **corrección** = ajuste auditado sobre el mismo pedido, con los 3 guards del backend mostrados como mensajes claros; **nueva demanda** = pedido nuevo independiente vinculado por `pedidoOrigenId`, con cliente y canal precargados. **Nunca** por inferencia. **Nunca** una pantalla ambigua donde las dos cosas se confunden.

**Autoridad de cálculo, guards y reglas: el backend.** El frontend declara intención, muestra impacto proyectado (read-only) y permite decidir.

**Blueprint:** §5.2 (G11 — corrección vs nueva demanda). **Gates:** G7 (ninguna regla crítica solo en frontend), G8 (preview y commit separados para operaciones sensibles).

---

## 0. Contexto técnico (investigación, 2026-09-08)

### Backend G11 existente — **fijo, no se toca la lógica**

| Pieza | Estado | Detalle |
|---|---|---|
| `POST /api/pedidos/[id]/ajustar-cantidad` | ACTIVO | `requireRole([ADMIN, ASISTENTE])`. Body: `{ producto, cantidadNueva, motivo (min 1), obligacionId?, offlineId? }`. Idempotente por `offlineId`. |
| `AjustarPedidoCantidadUseCase` | ACTIVO | Lock `PEDIDO:{id}`. Lee `cantidadOriginal`/`cantEntrega` **dentro** del lock. Actualiza `PedidoItem.cantPedido`/`subtotal`, `Pedido.total`/`saldo`/`estadoPago`, `Factura`. Registra `PedidoCantidadAjuste` (append-only: `cantidadOriginal`, `cantidadNueva`, `delta`, `motivo`, `autorizadoPorId`). |
| Guard C — `CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA` | ACTIVO | `item.cantEntrega > 0` para ese producto. |
| Guard D — `CORRECCION_PEDIDO_CERRADO` | ACTIVO | `estadoEntrega ∈ {ENTREGADO, CANCELADO, ANULADO}`. |
| Guard sobrepago — `CORRECCION_GENERARIA_SOBREPAGO` | ACTIVO | `totalPagado > nuevoTotal` (bajar cantidad dejaría al cliente con pago en exceso). |
| `POST /api/pedidos` con `pedidoOrigenId` | ACTIVO | `CrearPedidoUseCase` / `PreviewPedidoUseCase` ya validan `pedidoOrigenId` (`PedidoOrigenNotFoundError`). |
| Peek — "Pedidos vinculados (G11)" | ACTIVO | `peek-relaciones.tsx:62` ya renderiza `data.pedidosVinculados` con rol `demanda`/`origen`. `GET /api/pedidos/[id]` ya expone `pedidosVinculados` (Fase 4b, #224). |
| Workspace | ACTIVO | `WorkspacePedidoInicial` ya tiene `pedidoOrigenId?` y `origen: 'PEDIDO' \| 'VENTA_RAPIDA'`. `use-preview` lo envía. C4 (#229) montó el modo edición; F6 monta el modo "nueva demanda" (creación con origen). |

### Brechas encontradas (F6 las cierra)

- **B1 — el route no mapea los guards a estado/código.** `ajustar-cantidad/route.ts` solo mapea `AJUSTE_EXIGE_AUTORIZACION → 403`; los 3 guards (`CORRECCION_*`) caen al `catch` genérico → **HTTP 500 + "Error ajustando cantidad de pedido"**. El blueprint exige mostrarlos como mensajes específicos. **Fix (F6-0):** mapear a **409** con un `code` machine-readable en el body, sin tocar el use case.
- **B2 — no hay proyección read-only del ajuste.** El blueprint §5.2 pide `INTENT → PREVIEW (antes→después por producto) → IMPACT (Δ total, Δ saldo, ¿sobrepago?) → COMMIT`. Hoy solo existe el COMMIT. **Fix (F6-0):** `ProyectarAjusteCantidadUseCase` + `POST /api/pedidos/[id]/ajustar-cantidad/preview` (mismo patrón que F5-0 `ProyectarGestionPendienteUseCase`). Read-only: sin `$transaction` de escritura, sin lock, sin mutación. **NO se llama "preview" a secas en la UI** — "impacto estimado" / "proyección".
- **B3 — `nueva-demanda` es un stub.** `pedidos-client/index.tsx:1333` `case 'nueva-demanda'` hace `setPedidoInicial(undefined); setShowModal(true)` → creación **en blanco**, sin `pedidoOrigenId`, sin precarga de cliente/canal. **Fix (F6-ii):** pasar un `pedidoInicial` de nueva demanda (cliente + canal del original, `pedidoOrigenId`, items en blanco) y montar el workspace en ese modo.
- **B4 — no existe el punto de decisión.** No hay componente "¿Qué pasó?". F5 ofrece `nueva-demanda` directamente desde la frontera N2 (correcto para ese caso: no hay obligación aún). Pero para un pedido **con** items ya capturados, cambiar cantidades exige elegir causa primero. **Fix (F6-i):** `PedidoCambioCantidadDecision` — sin opción "no sé".

### Lo que NO se toca / NO se inventa

- La lógica de `AjustarPedidoCantidadUseCase` y sus 3 guards — fijos.
- No se crea un modelo `PedidoAuditDiff` (no existe; el registro de auditoría **es** `PedidoCantidadAjuste`, append-only con motivo + actor + antes/después).
- No se inventan umbrales de autorización monetaria (blueprint §8.2, PENDIENTE DE NEGOCIO). `AJUSTE_EXIGE_AUTORIZACION` hoy solo salta si falta `autorizadoPorId`; F6 lo mapea a 403 y muestra el mensaje, no inventa política de doble control.
- No se toca `POST /api/pedidos` ni `CrearPedidoUseCase`.
- No se reabre G6, N2, `ventaRapida→origen`, independencia `origen×canal`.

---

## 1. Precisiones a respetar (blueprint §5.2 + revisión del equipo 2026-09-08)

| # | Precisión | Cómo se cumple |
|---|---|---|
| **P1** | **Elección explícita, nunca inferida.** El componente nunca decide la causa por el estado del pedido. | `PedidoCambioCantidadDecision` es un paso obligatorio; sin default seleccionado; sin "no sé". |
| **P2** | **Sin opción "no sé".** Si el usuario no puede determinar la causa, el flujo **explica por qué la distinción importa**, no inventa una clasificación. | Texto de ayuda expandible: "Corrección cambia este pedido y su factura. Nueva demanda crea un pedido aparte. Si te equivocaste al escribir la cantidad → Corrección. Si el cliente cambió lo que quiere → Nueva demanda." Nunca un botón "continuar sin decidir". |
| **P3** | **La selección es declaración de causa, no autorización.** Después siguen validaciones, preview, impacto, (autorización si hay política), commit, auditoría. | El componente solo emite `'correccion' \| 'nueva-demanda'`; no ejecuta nada. |
| **P4** | **Los 3 guards se muestran como mensajes del backend, no se predicen client-side.** El backend es la autoridad. | La proyección (F6-0) devuelve `bloqueadoPor: GuardCode \| null` calculado en el servidor; el form muestra el mensaje mapeado. El cliente **no** replica `cantEntrega > 0` ni `estadoEntrega ∈ {...}`. El commit **vuelve a validar** todo (no confía en la proyección). |
| **P5** | **Un guard rechazado NO reinterpreta la intención.** Si el usuario declaró "Corrección" y el backend responde `CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA`, el flujo **NO** convierte automáticamente eso en Nueva Demanda ni en Venta Libre. | El form de corrección muestra: *"Esta cantidad ya fue entregada y no puede modificarse mediante este flujo."* + lista las **alternativas válidas si existen** (p.ej. un botón separado "¿El cliente pidió más? → Nueva demanda") que el usuario debe **elegir explícitamente**. Volver al punto de decisión es una acción del usuario, no del sistema. |
| **P6** | **Rama B crea una obligación independiente.** `pedidoOrigenId` es la **única** relación persistida. Modificar el nuevo Pedido no toca el original y viceversa. | `WorkspacePedidoInicial` con `modo: 'nueva-demanda'` (cliente/canal read-only, items en blanco, `pedidoOrigenId`). La relación inversa (desde el original) se obtiene por **consulta/proyección** (`GET /api/pedidos/[id]` ya lista `pedidosVinculados`), **no** se persiste un segundo campo. |
| **P7** | **Preview y commit separados (G8).** Impacto read-only antes de confirmar una corrección. El preview no muta nada (ver §2 garantías). | `POST .../ajustar-cantidad/preview` → panel de impacto → `[Confirmar corrección]` → `POST .../ajustar-cantidad` (re-valida). |
| **P8** | **Concurrencia: el commit valida el estado fresco aunque exista un preview previo.** | El use case ya lee `cantidadOriginal`/`cantEntrega`/`total` **dentro** del lock `PEDIDO:{id}`. F6 lo **prueba**: `preview → otro usuario modifica → commit original` → el commit parte del estado nuevo, no de la proyección obsoleta. + prueba de dos ajustes concurrentes sobre la misma obligación. |
| **P9** | **Venta Libre NO es una acción de creación dentro de Pedidos.** | El punto de decisión de G11 ofrece **exactamente dos** opciones de creación/ajuste: *Corregir* y *Nueva demanda*. Venta Libre **no** aparece como tercera opción. Cualquier "Venta durante la ruta →" es solo navegación a Embarques (F5 §3bis, `hub-accion-frontera.test.ts`). Ver `VENTA_LIBRE_EXPERIENCIA_HUB_v1.0.md` §0/§0bis/§3bis. |
| **P10** | **No inventar autorización monetaria.** Umbrales, doble control, separación de funciones siguen PENDIENTES (blueprint §8.2). | F6 mapea `AJUSTE_EXIGE_AUTORIZACION → 403` y muestra el mensaje del backend. No agrega umbrales ni gates nuevos. |
| **P11** | **Vínculo visible desde el peek de ambos** (original ↔ nueva demanda). | Ya lo hace `peek-relaciones.tsx`. F6 verifica con E2E que tras crear la nueva demanda, el peek del original la muestra y viceversa. |

**Mentalidad de G11 (queda en la definición):** el flujo expresa *"¿Qué pasó?"* y permite declarar explícitamente **"Corregir una obligación existente"** o **"Crear una nueva demanda"**. La Venta Libre no se convierte en una tercera acción de creación dentro de Pedidos — es una operación del contexto Embarques/Conciliación que después puede **representarse** en Pedidos. Prioridad: mantener la separación **corrección ≠ nueva demanda ≠ Venta Libre**, con el usuario declarando cuál situación ocurre y el backend validando/ejecutando.

---

## 2. Contrato de datos

### `POST /api/pedidos/[id]/ajustar-cantidad/preview` (nuevo, F6-0) — read-only

**Body:** `{ producto: string, cantidadNueva: number (int, >=0) }`
**`requireRole([ADMIN, ASISTENTE])`** (paridad con el commit).

**Result (información suficiente para explicar la consecuencia — la UI decide qué mostrar progresivamente):**
```ts
type GuardCode =
  | 'CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA'
  | 'CORRECCION_PEDIDO_CERRADO'
  | 'CORRECCION_GENERARIA_SOBREPAGO'

interface ProyectarAjusteCantidadResult {
  producto: string
  // cantidad
  cantidadOriginal: number          // item.cantPedido actual
  cantidadEntregada: number         // item.cantEntrega
  cantidadNueva: number
  delta: number                     // cantidadNueva - cantidadOriginal
  // precio / subtotales
  precioHistorico: number           // item.precio — NUNCA cambia
  subtotalAntes: number             // item.subtotal actual
  subtotalDespues: number           // cantidadNueva * precioHistorico
  // pedido
  totalAntes: number; totalDespues: number
  totalPagado: number
  saldoAntes: number; saldoDespues: number
  estadoEntrega: string             // actual (contexto para el guard PEDIDO_CERRADO)
  estadoPagoAntes: string; estadoPagoDespues: string   // calcularEstadoPago(totalDespues, totalPagado, estadoEntrega)
  // impacto / señales
  sobrepagoProyectado: number       // max(0, totalPagado - totalDespues) — informativo
  bloqueadoPor: GuardCode | null    // guard que bloquearía el commit, calculado en servidor
  warnings: { code: string; message: string }[]        // p.ej. SIN_CAMBIO (delta 0), REDUCE_BAJO_ENTREGADO
  allowedActions: ('confirmar-correccion' | 'ir-a-nueva-demanda' | 'ir-a-cartera')[]  // qué puede hacer el usuario
  puedeCorregir: boolean            // bloqueadoPor === null && delta !== 0
}
```
`allowedActions` es **informativo para la UI** (qué botones tienen sentido), **no** una autorización — el usuario elige, el commit re-valida. `ir-a-nueva-demanda`/`ir-a-cartera` no ejecutan nada: llevan al usuario a declarar/hacer otra cosa explícitamente (P5).

**Errores:** `PEDIDO_NOT_FOUND` → 404, `PEDIDO_ITEM_NOT_FOUND` → 404, Zod → 400.

**Garantías read-only (test guardrail — P4, revisión del equipo §4):** el use case usa `prisma` directo (solo lecturas). **Prohibido:** `withAdvisoryLock` · `$transaction` de escritura · locks de escritura · `tx.*.update` / `tx.*.create` / `tx.*.delete` · `logAudit` / cualquier registro de auditoría persistente · `incrementMetric` con efecto de estado · publicación de eventos realtime · cualquier efecto derivado. Snapshot deep de `Pedido` + `PedidoItem[]` + `Factura` + `Cliente` + `Pago[]` antes/después de N llamadas a `preview` == idénticos byte a byte. El **commit** vuelve a validar todo en backend (no confía en la proyección).

### `POST /api/pedidos/[id]/ajustar-cantidad` (existente) — mapeo de errores (F6-0)

| Error del use case | Antes | Después (F6-0) |
|---|---|---|
| `AJUSTE_EXIGE_AUTORIZACION` | 403 | 403 (sin cambio) |
| `PEDIDO_NOT_FOUND` | 500 | **404** |
| `PEDIDO_ITEM_NOT_FOUND: X` | 500 | **404** |
| `CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA` | 500 | **409** `{ error, code: 'CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA' }` |
| `CORRECCION_PEDIDO_CERRADO: ...` | 500 | **409** `{ error, code: 'CORRECCION_PEDIDO_CERRADO' }` |
| `CORRECCION_GENERARIA_SOBREPAGO: ...` | 500 | **409** `{ error, code: 'CORRECCION_GENERARIA_SOBREPAGO' }` |
| otro | 500 | 500 (sin cambio) |

Solo cambia el **controlador** (mapeo `error.message` → status + code). El use case no se toca.

### Mensajes de los guards (F6-i, en el cliente, a partir del `code`)

El mensaje **describe la situación y ofrece alternativas que el usuario elige** — nunca reinterpreta la intención automáticamente (P5).

| `code` | Mensaje | Alternativa(s) que el usuario puede elegir |
|---|---|---|
| `CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA` | "Esta cantidad ya fue entregada (**N** unidades) y no puede modificarse mediante este flujo. Lo entregado es cumplimiento histórico." | Botón separado *"El cliente pidió más → Nueva demanda"* (vuelve al punto de decisión, rama B). El usuario decide; el sistema no convierte. |
| `CORRECCION_PEDIDO_CERRADO` | "Este pedido ya está **{estadoEntrega}**. Un pedido cerrado no se reabre desde acá; corregirlo requiere una **reversión monetaria**." | Link a Cartera (navegación, no ejecución). |
| `CORRECCION_GENERARIA_SOBREPAGO` | "El cliente ya pagó **$X**. Bajar la cantidad dejaría **$Y** a favor. Primero hay que registrar esa devolución/crédito." | Link a Cartera (navegación). No se aplica la corrección. |

---

## 3. Slices

### F6-0 — proyección read-only + mapeo de errores del commit
**Archivos:**
- Crear `src/modules/pedidos/application/use-cases/ProyectarAjusteCantidadUseCase.ts`
- Crear `src/app/api/pedidos/[id]/ajustar-cantidad/preview/route.ts`
- Modificar `src/app/api/pedidos/[id]/ajustar-cantidad/route.ts` (solo el `catch`)
- Tests:
  - `ProyectarAjusteCantidadUseCase.test.ts` (unit) — cada guard proyectado; delta 0 → warning `SIN_CAMBIO`; subida/bajada de cantidad; `estadoPagoDespues` correcto.
  - `preview/__tests__/route.test.ts` — thin-controller + guardrail read-only (regex de fuente: sin `withAdvisoryLock`/`update`/`create`/`logAudit`/`publishRealtimeEvent`).
  - extender `src/lib/__tests__/integration/ajuste-pedido.test.ts`:
    - proyección == commit real **campo a campo** (mismo `precioHistorico`, `subtotalDespues`, `totalDespues`, `saldoDespues`, `bloqueadoPor`).
    - **deep-snapshot** de Pedido+PedidoItem[]+Factura+Cliente+Pago[] antes/después de 3 `preview` consecutivos == idénticos.
    - **concurrencia (P8):** `preview(cantidad=8)` → segundo ajuste real lleva el pedido a otra `cantidadOriginal` → `commit(cantidad=8)` original **parte del estado nuevo** (su `PedidoCantidadAjuste.cantidadOriginal` refleja el valor fresco, no el de la proyección) y el resultado respeta los invariantes.
    - **dos commits concurrentes** sobre la misma obligación → se serializan bajo `PEDIDO:{id}` (2 `PedidoCantidadAjuste`, encadenados, sin violar `chk_obligacion_cantidades_no_negativas`).

**Criterio:** la proyección replica exactamente los números del use case sin escribir nada. El commit devuelve 409+code estable para los 3 guards y **re-valida el estado fresco** aunque exista un preview previo.

### F6-i — punto de decisión + rama A (formulario de corrección) ✅ IMPLEMENTADO
**Archivos:**
- Crear `src/app/(app)/pedidos/pedido-hub/pedido-cambio-cantidad-decision.tsx` — "¿Qué pasó?" → `'correccion' | 'nueva-demanda'`. **Exactamente dos** opciones. Sin default. Sin "no sé". Sin Venta Libre (P9). Ayuda expandible que explica la distinción (P2).
- Crear `src/app/(app)/pedidos/pedido-hub/correccion-cantidad-form.tsx` — producto + `cantidadNueva` + `motivo` obligatorio → proyecta on change → `<AjusteImpacto>` → `[Confirmar corrección]`. Si `bloqueadoPor` != null: muestra el mensaje del guard + las alternativas **como botones que el usuario elige** (P5) — nunca navega/convierte solo.
- Crear `src/app/(app)/pedidos/pedido-hub/ajuste-impacto.tsx` — cantidad antes→después + Δ, precio unitario, subtotal antes→después, total antes→después, totalPagado, saldo antes→después, estadoPago antes→después, sobrepago proyectado, `warnings`, guard bloqueante como mensaje. Divulgación progresiva (la UI elige qué mostrar; la data está completa).
- Crear `src/app/(app)/pedidos/pedido-hub/use-ajuste-cantidad.ts` — hook: `proyectar` (fetch plano, stale-guard por `reqRef`); `confirmar` (via `fetchResilient`, detecta `statusCode === 409` + `code`); `limpiar`.
- Modificar `pedido-exception-panel.tsx` / peek — exponer "Cambiar cantidades" cuando el pedido tiene items y admite ajuste; abre el punto de decisión inline.
- Tests: `pedido-cambio-cantidad-decision.test.tsx` (dos opciones, sin "no sé", explica la distinción, sin Venta Libre), `correccion-cantidad-form.test.tsx` (motivo obligatorio; guard `SOBRE_CANTIDAD_YA_ENTREGADA` → muestra mensaje + botón "Nueva demanda" que **no** se dispara solo), `ajuste-impacto.test.tsx` (todos los campos), `use-ajuste-cantidad.test.ts` (stale-guard, 409+code).

**Criterio:** imposible confirmar una corrección sin motivo. Un guard rechazado muestra su mensaje + alternativas que el usuario elige (P5) — **nunca** convierte la intención. El impacto mostrado == el de la proyección (no recalculado en cliente).

**Implementado:** `use-ajuste-cantidad.ts` (proyectar plano + stale-guard, confirmar via `fetchResilient`, `guardFromMessage` extrae el `code` del 409 sin reinterpretar la intención), `ajuste-impacto.tsx`, `pedido-cambio-cantidad-decision.tsx` (2 opciones, sin "no sé", sin Venta Libre, ayuda expandible), `correccion-cantidad-form.tsx` (motivo obligatorio; guard proyectado **o** del commit → mensaje + alternativas como botones que el usuario elige; `commitGuard` atado a la firma de inputs, sin set-state-in-effect), `pedido-cambio-cantidad.tsx` (contenedor: decisión → rama A inline / rama B `onNuevaDemanda`). Wireado en `peek-relaciones.tsx` (`puedeAjustar` = `canSeePrecioOrigen` de `peek-panel.tsx`, sólo ADMIN/ASISTENTE). 33 unit (decision 6 · impacto 5 · hook 6 · form 5 · contenedor 5 + regresión peek). tsc + eslint limpios.

### F6-ii — rama B (nueva demanda reusa el workspace) ✅ IMPLEMENTADO
**Archivos:**
- Modificar `src/components/pedido-workspace/types.ts` — `WorkspaceModo` += `'nueva-demanda'` (o reusar `pedidoInicial` con un flag)
- Modificar `PedidosWorkspace` — modo nueva demanda: cliente + canal precargados **read-only**, items en blanco, `pedidoOrigenId` en el payload de preview y de commit; copy "Nueva demanda de {cliente} · Pedido origen #{n}"
- Modificar `src/app/(app)/pedidos/pedidos-client/index.tsx` — `case 'nueva-demanda'`: construir el `pedidoInicial` de nueva demanda desde el `pedido` (clienteId, canal, `pedidoOrigenId: pedido.id`) y montar el workspace
- Tests:
  - workspace nueva-demanda: cliente/canal inmutables, items en blanco, `pedidoOrigenId` viaja en preview y commit.
  - `pedidos-client` handler: construye el inicial correcto (no en blanco), no llama a `venta-libre` ni `ajustar-cantidad`.
  - **independencia (P6, integración):** `pedido-nueva-demanda-relacionado.test.ts` extendido — tras crear la nueva demanda, `ActualizarPedidoUseCase`/`AjustarPedidoCantidadUseCase` sobre el **nuevo** no cambia ningún campo del **original** (`total`/`saldo`/`items`/`estadoPago`), y viceversa. Solo existe `pedidoOrigenId` persistido; la relación inversa se resuelve por query (`GET /api/pedidos/[original]` → `pedidosVinculados` incluye el nuevo).

**Criterio:** el pedido creado tiene `pedidoOrigenId` = id del original; cliente y canal == los del original y no editables; **modificar uno no modifica el otro**; el resto del flujo de creación es el normal (misma fricción). No se persiste una segunda relación para la UI.

**Implementado:** `WorkspaceProps += modo?: 'crear' | 'nueva-demanda'` + `pedidoOrigenNumero?`. En modo nueva-demanda: bloque read-only `workspace-nueva-demanda` (cliente + canal del origen, inmutables), **sin** `PedidoContextPanel` ni toggle de canal; `handleCommit` emite `pedidoOrigenId: state.draft.pedidoOrigenId` + fuerza `origen: 'PEDIDO'`. `usePreview` ya enviaba `pedidoOrigenId` (validado read-only por `PreviewPedidoUseCase` → `PedidoOrigenNotFoundError`). `CrearPedidoPayload` + `PedidoUnifiedData` += `pedidoOrigenId?`; el route ya lo pasa a `CrearPedidoUseCase` (`route.ts:256,312`). `pedidos-client`: estado `nuevaDemanda` + `case 'nueva-demanda'` arma `{ pedidoOrigenId: pedido.id, numeroOrigen, clienteId, canal }` y monta el workspace con `initialDraft`; se limpia en todos los cierres/submits. Independencia P6 ya cubierta por `pedido-nueva-demanda-relacionado.test.ts` (backend). 12 unit nuevos (workspace nueva-demanda 2 + frontera source-check 2 + los existentes). tsc + eslint limpios.

### F6-iii — vínculo cruzado + verificación E2E
**Archivos:**
- Verificar/ajustar `peek-relaciones.tsx` — el bloque "Pedidos vinculados (G11)" ya existe; confirmar que muestra ambos sentidos (`rol: 'origen'` en la nueva demanda, `rol: 'demanda'` en el original)
- E2E `e2e/pedidos-g11.spec.ts` (cubre G11-01..G11-08 de §6):
  - (a) corrección válida antes de entrega: proyección → impacto → confirmar → total ajustado, `PedidoCantidadAjuste` registrado con motivo.
  - (b) cada guard: `SOBRE_CANTIDAD_YA_ENTREGADA` / `PEDIDO_CERRADO` / `GENERARIA_SOBREPAGO` → 409, mensaje específico, **Pedido sin mutar**, **no** se crea Nueva Demanda ni Venta Libre automáticamente.
  - (c) nueva demanda → pedido nuevo con `pedidoOrigenId`, visible en el peek de ambos sentidos.
  - (d) independencia: editar la nueva demanda no cambia el original (verificado por UI + relectura).
  - (e) el punto de decisión no ofrece Venta Libre; no hay endpoint de creación de VL alcanzable desde el Hub.
- Tests unit del mapeo `code → mensaje` (los 3) + del punto de decisión (2 opciones, sin "no sé").

**Criterio (blueprint §5.2):** imposible llegar a un estado ambiguo; los pedidos vinculados son visibles desde el peek del original y viceversa. Un guard rechazado nunca reinterpreta la intención. La prueba del usuario (G11 gate): si al probarlo dice *"es la misma pantalla, pero más ordenada"* → no cumple. El punto de decisión debe sentirse como una pregunta real, no un paso de más.

---

## 4. Criterios de éxito (globales)

Un usuario, ante un cambio de cantidades en un pedido, puede:
1. entender que **debe** declarar la causa y **por qué** (corrección ≠ nueva demanda);
2. ver, **antes de confirmar** una corrección, el impacto exacto (antes→después, Δ total, Δ saldo, si genera sobrepago);
3. recibir, si un guard bloquea, un **mensaje claro con la salida correcta** (no un error genérico);
4. crear una nueva demanda **sin volver a capturar** cliente ni canal, con el vínculo al original;
5. ver el vínculo entre el pedido original y la nueva demanda desde el peek de cualquiera de los dos.

Y la interfaz **nunca**: infiere la causa, ofrece "continuar sin decidir", ejecuta una corrección sobre lo ya entregado, reinterpreta un guard rechazado como otra intención, presenta corrección y nueva demanda como la misma acción, ni ofrece crear una Venta Libre.

## 5bis. Matriz de casos G11 (criterios mínimos — revisión del equipo §9)

| ID | Caso | Criterio de éxito | Slice |
|---|---|---|---|
| **G11-01** | Corrección válida antes de entrega | proyección → impacto → confirmación → ajuste correcto (`PedidoItem`, `Pedido.total/saldo/estadoPago`, `Factura`, `PedidoCantidadAjuste` con motivo+actor) | F6-0 + F6-i |
| **G11-02** | Corrección sobre cantidad ya entregada | backend 409 `CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA` → **Pedido sin mutar** · **no** se crea automáticamente Nueva Demanda ni Venta Libre · se muestran alternativas que el usuario elige | F6-0 + F6-i |
| **G11-03** | Pedido cerrado | 409 `CORRECCION_PEDIDO_CERRADO` → no mutación · mensaje + link a Cartera (navegación) | F6-0 + F6-i |
| **G11-04** | Corrección que generaría sobrepago | 409 `CORRECCION_GENERARIA_SOBREPAGO` → no mutación · muestra `$X` pagado y `$Y` a favor proyectado | F6-0 + F6-i |
| **G11-05** | Nueva demanda | crea un Pedido **independiente** con `pedidoOrigenId`; cliente/canal del original; items nuevos | F6-ii |
| **G11-06** | Independencia | modificar el nuevo Pedido no modifica el original y viceversa; una sola relación persistida (`pedidoOrigenId`), inversa por consulta | F6-ii |
| **G11-07** | Concurrencia | `preview` obsoleto no produce una mutación incorrecta; el commit re-valida el estado fresco bajo lock; dos ajustes concurrentes se serializan | F6-0 |
| **G11-08** | Venta Libre no se crea desde el Pedido Hub | el punto de decisión no la ofrece; no hay endpoint de creación de VL alcanzable desde Pedidos | F6-i (+ F5 §3bis) |
| **G11-09** | Venta Libre durante ruta | su creación pertenece al Embarque y al repartidor responsable (fuera de F6 — contexto Embarques) | — (contrato VL) |
| **G11-10** | Venta Libre durante conciliación | su creación pertenece a la conciliación del Embarque y requiere usuario autorizado (fuera de F6) | — (contrato VL) |

G11-09/G11-10 no son trabajo de F6; se listan para dejar explícito que el flujo de G11 **no** los cubre ni debe intentarlo. Ver `VENTA_LIBRE_EXPERIENCIA_HUB_v1.0.md` §0bis y BRECHA-8 de la auditoría.

## 5. Fuera de alcance (no reabrir)

- La lógica de `AjustarPedidoCantidadUseCase` y sus 3 guards — fijos.
- Umbrales de autorización monetaria / doble control (blueprint §8.2 PENDIENTE DE NEGOCIO).
- Reversión monetaria de un sobrepago (Cartera / `ADR-CORRECCION-MONETARIA-001`) — F6 solo **explica** que hace falta, no la ejecuta.
- N2: el `PedidoExceptionPanel` de F5 ya cubre completar-pendiente; F6 añade "cambiar cantidades" como acción distinta, no la fusiona.
- `pedido-form-unified` legacy — se retira en Fase 9/10.
