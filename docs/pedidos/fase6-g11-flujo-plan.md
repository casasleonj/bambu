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

## 1. Las 7 precisiones a respetar (derivadas del blueprint §5.2 + principios)

| # | Precisión | Cómo se cumple |
|---|---|---|
| **G6-1** | **Elección explícita, nunca inferida.** El componente nunca decide la causa por el estado del pedido. | `PedidoCambioCantidadDecision` es un paso obligatorio; sin default seleccionado; sin "no sé". |
| **G6-2** | **Sin opción "no sé".** Si el usuario no puede determinar la causa, el flujo **explica por qué la distinción importa**, no inventa una clasificación. | Texto de ayuda expandible: "Corrección cambia este pedido y su factura. Nueva demanda crea un pedido aparte. Si te equivocaste al escribir la cantidad → Corrección. Si el cliente cambió lo que quiere → Nueva demanda." Nunca un botón "continuar sin decidir". |
| **G6-3** | **La selección es declaración de causa, no autorización.** Después siguen validaciones, preview, impacto, (autorización si hay política), commit, auditoría. | El componente solo emite `'correccion' \| 'nueva-demanda'`; no ejecuta nada. |
| **G6-4** | **Los 3 guards se muestran como mensajes del backend, no se predicen client-side.** | La proyección (F6-0) devuelve `bloqueadoPor?: GuardCode` calculado en el servidor; el form muestra el mensaje mapeado. El cliente **no** replica `cantEntrega > 0` ni `estadoEntrega ∈ {...}`. |
| **G6-5** | **Rama B reusa el workspace, no un formulario nuevo.** Cliente y canal precargados e inmutables; items en blanco; `pedidoOrigenId` seteado. | `WorkspacePedidoInicial` + un `modo: 'nueva-demanda'` (cliente/canal read-only, sin "editar cliente"). |
| **G6-6** | **Preview y commit separados (G8).** Para la corrección: impacto read-only antes de confirmar. | `POST .../ajustar-cantidad/preview` → `N2`-style panel de impacto → `[Confirmar corrección]` → `POST .../ajustar-cantidad`. |
| **G6-7** | **Vínculo `pedidoOrigenId` visible desde el peek de ambos** (original ↔ nueva demanda). | Ya lo hace `peek-relaciones.tsx`. F6 verifica con test E2E que tras crear la nueva demanda, el peek del original la muestra y viceversa. |

---

## 2. Contrato de datos

### `POST /api/pedidos/[id]/ajustar-cantidad/preview` (nuevo, F6-0) — read-only

**Body:** `{ producto: string, cantidadNueva: number (int, >=0) }`
**`requireRole([ADMIN, ASISTENTE])`** (paridad con el commit).

**Result:**
```ts
interface ProyectarAjusteCantidadResult {
  producto: string
  cantidadOriginal: number          // item.cantPedido actual
  cantidadEntregada: number         // item.cantEntrega
  cantidadNueva: number
  delta: number                     // cantidadNueva - cantidadOriginal
  precioHistorico: number           // item.precio — NUNCA cambia
  // impacto económico proyectado
  totalAntes: number; totalDespues: number
  saldoAntes: number; saldoDespues: number
  totalPagado: number
  // guard que bloquearía el commit (calculado en servidor), o null
  bloqueadoPor: 'CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA'
              | 'CORRECCION_PEDIDO_CERRADO'
              | 'CORRECCION_GENERARIA_SOBREPAGO'
              | null
  sobrepagoProyectado: number       // max(0, totalPagado - totalDespues) — informativo aunque bloqueadoPor sea otro
  puedeCorregir: boolean            // bloqueadoPor === null
}
```
**Errores:** `PEDIDO_NOT_FOUND` → 404, `PEDIDO_ITEM_NOT_FOUND` → 404, Zod → 400.

**Regla de no-mutación (test guardrail):** el use case usa `prisma` directo (lecturas), **nunca** `withAdvisoryLock` / `tx.*.update` / `tx.*.create`. Snapshot deep de Pedido+PedidoItem+Factura antes/después de `preview` == idénticos.

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

| `code` | Mensaje |
|---|---|
| `CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA` | "Ya se entregaron **N** unidades de este producto. Lo entregado no se corrige — si el cliente quiere otra cantidad, eso es **nueva demanda**." (ofrece cambiar a rama B) |
| `CORRECCION_PEDIDO_CERRADO` | "Este pedido ya está **{estadoEntrega}**. Un pedido cerrado no se reabre desde acá; corregirlo requiere una **reversión monetaria** (Cartera)." |
| `CORRECCION_GENERARIA_SOBREPAGO` | "El cliente ya pagó **$X**. Bajar la cantidad dejaría **$Y** a favor. Primero hay que registrar esa devolución/crédito en Cartera." |

---

## 3. Slices

### F6-0 — proyección read-only + mapeo de errores del commit
**Archivos:**
- Crear `src/modules/pedidos/application/use-cases/ProyectarAjusteCantidadUseCase.ts`
- Crear `src/app/api/pedidos/[id]/ajustar-cantidad/preview/route.ts`
- Modificar `src/app/api/pedidos/[id]/ajustar-cantidad/route.ts` (solo el `catch`)
- Tests: `ProyectarAjusteCantidadUseCase.test.ts` (unit), `preview/__tests__/route.test.ts` (thin-controller + read-only), extender `src/lib/__tests__/integration/ajuste-pedido.test.ts` (proyección == commit real campo a campo; deep-snapshot read-only)

**Criterio:** la proyección replica exactamente los números del use case (mismo `precioHistorico`, mismo `nuevoTotal`, mismo `bloqueadoPor`) sin escribir nada. El commit devuelve 409+code para los 3 guards.

### F6-i — punto de decisión + rama A (formulario de corrección)
**Archivos:**
- Crear `src/app/(app)/pedidos/pedido-hub/pedido-cambio-cantidad-decision.tsx` (¿Qué pasó? → `'correccion' | 'nueva-demanda'`)
- Crear `src/app/(app)/pedidos/pedido-hub/correccion-cantidad-form.tsx` (selector de producto + cantidadNueva + motivo obligatorio → proyecta on change → `<AjusteImpacto>` → `[Confirmar corrección]`)
- Crear `src/app/(app)/pedidos/pedido-hub/ajuste-impacto.tsx` (antes→después por producto, Δ total, Δ saldo, sobrepago, guard bloqueante como mensaje)
- Crear `src/app/(app)/pedidos/pedido-hub/use-ajuste-cantidad.ts` (hook: `proyectar` fetch plano con stale-guard; `confirmar` via `fetchResilient`, detecta 409+code)
- Modificar `pedido-exception-panel.tsx` / peek para exponer "Cambiar cantidades" cuando hay items y el pedido admite ajuste
- Tests: `pedido-cambio-cantidad-decision.test.tsx` (sin "no sé"; explica), `correccion-cantidad-form.test.tsx`, `ajuste-impacto.test.tsx`, `use-ajuste-cantidad.test.ts`

**Criterio:** imposible confirmar una corrección sin motivo. Los guards se muestran con su mensaje (no un 500 genérico). El impacto mostrado == el de la proyección (no recalculado en cliente).

### F6-ii — rama B (nueva demanda reusa el workspace)
**Archivos:**
- Modificar `src/components/pedido-workspace/types.ts` — `WorkspaceModo` += `'nueva-demanda'` (o reusar `pedidoInicial` con un flag)
- Modificar `PedidosWorkspace` — modo nueva demanda: cliente + canal precargados **read-only**, items en blanco, `pedidoOrigenId` en el payload de preview y de commit; copy "Nueva demanda de {cliente} · Pedido origen #{n}"
- Modificar `src/app/(app)/pedidos/pedidos-client/index.tsx` — `case 'nueva-demanda'`: construir el `pedidoInicial` de nueva demanda desde el `pedido` (clienteId, canal, `pedidoOrigenId: pedido.id`) y montar el workspace
- Tests: workspace nueva-demanda (cliente/canal inmutables, items en blanco, `pedidoOrigenId` viaja), `pedidos-client` handler (construye el inicial correcto, no en blanco)

**Criterio:** el pedido creado tiene `pedidoOrigenId` = id del original; cliente y canal == los del original y no editables; el resto del flujo de creación es el normal (misma fricción).

### F6-iii — vínculo cruzado + verificación E2E
**Archivos:**
- Verificar/ajustar `peek-relaciones.tsx` — el bloque "Pedidos vinculados (G11)" ya existe; confirmar que muestra ambos sentidos (`rol: 'origen'` en la nueva demanda, `rol: 'demanda'` en el original)
- E2E `e2e/pedidos-g11.spec.ts`: (a) corrección happy (bajar cantidad de un pedido PENDIENTE sin pagos → total baja, `PedidoCantidadAjuste` registrado); (b) corrección bloqueada por cada guard → mensaje correcto, sin 500; (c) nueva demanda → pedido nuevo con `pedidoOrigenId`, visible en el peek de ambos; (d) abuse: intentar "corrección" sobre cantidad ya entregada → el flujo redirige a nueva demanda, no la ejecuta como corrección
- Tests unit del mapeo `code → mensaje` (los 3)

**Criterio (blueprint §5.2):** imposible llegar a un estado ambiguo; los pedidos vinculados son visibles desde el peek del original y viceversa. La prueba del usuario (G11 gate): si al probarlo dice *"es la misma pantalla, pero más ordenada"* → no cumple. El punto de decisión debe sentirse como una pregunta real, no un paso de más.

---

## 4. Criterios de éxito (globales)

Un usuario, ante un cambio de cantidades en un pedido, puede:
1. entender que **debe** declarar la causa y **por qué** (corrección ≠ nueva demanda);
2. ver, **antes de confirmar** una corrección, el impacto exacto (antes→después, Δ total, Δ saldo, si genera sobrepago);
3. recibir, si un guard bloquea, un **mensaje claro con la salida correcta** (no un error genérico);
4. crear una nueva demanda **sin volver a capturar** cliente ni canal, con el vínculo al original;
5. ver el vínculo entre el pedido original y la nueva demanda desde el peek de cualquiera de los dos.

Y la interfaz **nunca**: infiere la causa, ofrece "continuar sin decidir", ejecuta una corrección sobre lo ya entregado, ni presenta corrección y nueva demanda como la misma acción.

## 5. Fuera de alcance (no reabrir)

- La lógica de `AjustarPedidoCantidadUseCase` y sus 3 guards — fijos.
- Umbrales de autorización monetaria / doble control (blueprint §8.2 PENDIENTE DE NEGOCIO).
- Reversión monetaria de un sobrepago (Cartera / `ADR-CORRECCION-MONETARIA-001`) — F6 solo **explica** que hace falta, no la ejecuta.
- N2: el `PedidoExceptionPanel` de F5 ya cubre completar-pendiente; F6 añade "cambiar cantidades" como acción distinta, no la fusiona.
- `pedido-form-unified` legacy — se retira en Fase 9/10.
