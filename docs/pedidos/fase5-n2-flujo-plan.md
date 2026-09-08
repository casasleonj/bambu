# Fase 5 — N2 (pendientes) en el flujo del Pedido Hub

> **For agentic workers:** implementación por slices (F5-0 → F5-i → F5-ii → F5-iii). TDD, commits frecuentes. Detrás de `NEXT_PUBLIC_PEDIDOS_V2` (OFF).

**Goal:** que el usuario **comprenda** qué parte de un pedido sigue pendiente, **qué propone** el sistema, **qué decide**, **cuál será/fue la consecuencia económica**, y **qué ocurrió** — sin conocer la implementación. Y que la interfaz **nunca** convierta *completar un pendiente*, *corregir un pedido*, *crear nueva demanda* y *registrar una Venta Libre* en una sola operación ambigua.

**Autoridad de cálculo y reglas económicas: el backend.** El frontend contextualiza, explica y permite decidir.

**No es** un panel CRUD aislado. Es parte de la experiencia del Pedido Hub (blueprint §5.1).

---

## 0. Contexto técnico (investigación, 2026-09-08)

### Endpoints N2 existentes (Fase 2, PR #216 — **fijos, no se tocan**)

| Endpoint | Semántica | Devuelve |
|---|---|---|
| `POST /api/pedidos/[id]/gestionar-pendiente` | **muta**: crea `ObligacionPendiente` + `Actividad`, **aplica el diferencial económico**. Roles ADMIN/ASISTENTE. Lock `PEDIDO:{id}`. Dedup `offlineId`. | `{ obligacionId, actividadId, deduped, diferencial?: { valorHistorico, valorActual, diferencial } }` |
| `POST /api/actividades/[id]/cambiar-modo` | **muta**: revierte el diferencial del modo anterior + recalcula fresco contra el modo destino | `{ actividadId, modoAnterior, modoNuevo, diferencial?, deduped }` |
| `POST /api/actividades/[id]/liberar` | **muta**: revierte lo reflejado en `Pedido.total`, anula la obligación. `motivo` **min 1** | `{ actividadId, obligacionId, obligacionAnulada, montoRevertido, deduped }` |

**Guards de `gestionar-pendiente`:** `PEDIDO_NOT_FOUND` (404) · `PEDIDO_ITEM_NOT_FOUND` (404) · `CANTIDAD_EXCEDE_PENDIENTE` (409, `cantidad ≤ cantPedido − cantEntrega`) · `OBLIGACION_YA_ACTIVA` (409, una sola obligación `ABIERTA` por `(pedido, producto)`). **No** guarda sobre `estadoEntrega`/`estadoPago` — ese filtro es responsabilidad de la experiencia (§caso matrix).

### Mecánica económica (`aplicar-diferencial-economico.service.ts`, `diferencial.service.ts`)

- `diferencial = valorActual − valorHistorico`, donde `valorHistorico = cantidadPendiente × PedidoItem.precio` (snapshot, **nunca se recalcula**) y `valorActual` = `resolverPreciosPedido([producto, cantidad], modoDestino, cliente, negocio)` (reglas comerciales **vigentes**).
- **`diferencial > 0`** → `Pedido.total` += diferencial · `saldo` += diferencial · `Factura` actualizada · `estadoPago` reproyectado. El cobro usa el flujo existente (cartera / pagar-fiado).
- **`diferencial < 0`** → `Cliente.saldoFavor` += `|diferencial|`. **`Pedido.total` NO baja.**
- **`diferencial === 0`** → solo un `PedidoCantidadAjuste` (trazabilidad: "se evaluó, sin ajuste").
- **Liberar / cambiar-modo** revierten lo reflejado en `Pedido.total` (el caso positivo). **El crédito negativo ya en `Cliente.saldoFavor` NO se revierte automáticamente** (`CambiarModoActividadUseCase` lo documenta explícitamente).

### `GET /api/pedidos/[id]` (Fase 4b, PR #224 — ya extendido)

`pendienteN2 = { id, producto, remanente: cantidadOriginal − cantidadCumplida, estado: 'ABIERTA'|'CUMPLIDA'|'ANULADA', actividades: [{ id, tipo: 'ENTREGA'|'RECOGIDA_BOTELLON'|'COBRO', cantidad, cantidadCumplida, estado: 'ASIGNADA'|'EN_PROGRESO'|'CUMPLIDA'|'CANCELADA', modo: 'PUNTO'|'DOMICILIO'|null, embarqueId }] }` o `null`.

### Peek hoy

`peek-relaciones.tsx:72` — stub amber: "Pendiente (N2) · X producto · estado · *La gestión se hace desde el detalle (Fase 5)*". **F5 lo reemplaza.**

---

## 1. Precisiones del equipo (vinculantes)

### P1 — N2 no es automáticamente una "excepción"

Un pendiente parcial puede ser **normal** en el ciclo de una operación. La interfaz distingue cinco naturalezas y **no** presenta todo `pendienteN2` como anomalía:

| Naturaleza | Cuándo | Tratamiento visual |
|---|---|---|
| **pendiente normal** | remanente > 0, obligación `ABIERTA` con actividades `ASIGNADA`/`EN_PROGRESO`, sin señales | neutro/informativo (no rojo, no ⚠) — "Pendiente: 5 pacas agua" |
| **excepción** | la obligación o su gestión requiere una acción humana fuera del curso normal (p.ej. `liberar` sin completar) | ámbar, microcopy explícito |
| **conflicto** | `409` del backend en una acción en curso (`OBLIGACION_YA_ACTIVA`, `CANTIDAD_EXCEDE_PENDIENTE`) | ámbar, mensaje del backend + qué hacer |
| **inconsistencia** | el estado del pedido no admite la gestión pero existe una obligación abierta (p.ej. pedido `CANCELADO` con obligación `ABIERTA`) | ámbar, "revisar" |
| **riesgo** | hay un `Caso`/alerta relacionada con el pendiente o el diferencial | señal (§5.3), no bloqueo |

La lista/foco "Pendientes (N2)" cuenta **todos**; el color y el ⚠ solo aparecen para excepción/conflicto/inconsistencia/riesgo.

### P2 — Semántica de confirmación: **B** (impacto primero, luego confirmar)

El blueprint plantea mostrar el impacto **antes** de confirmar. `gestionar-pendiente` no tiene preview. **No** convertimos esa limitación en "formulario = preview".

**Decisión: semántica B.** Se agrega un endpoint de **proyección read-only** (`F5-0`): el usuario elige producto/cantidad/modo → el sistema **proyecta** `{ remanente, diferencial: { valorHistorico, valorActual, diferencial }, consecuencia }` **sin mutar** → el usuario revisa → confirma → `gestionar-pendiente` (que revalida y aplica).

- El endpoint de proyección **compone** `calcularDiferencial` (ya es una función pura de lectura). Cero cálculo nuevo. Mismo patrón que `POST /api/pedidos/preview`.
- El `gestionar-pendiente` real **revalida todo** (OWASP: no confiar en datos preparados entre proyección y commit). La proyección puede quedar stale (precio cambió) → el resultado real puede diferir; la UX lo dice.
- Se llama **"proyección"** / "impacto estimado", nunca "preview" a secas.

> **Diferencia documentada respecto al blueprint original:** el blueprint §5.1 tabula `CONTEXT → PROPOSAL "[Confirmar]"` como si `gestionar-pendiente` mostrara el diferencial. En realidad `gestionar-pendiente` **muta**. F5-0 añade la proyección read-only para cumplir la intención del blueprint (impacto antes de decidir) sin cambiar la semántica de los endpoints existentes. Criterio de éxito §criterios: verificado que la proyección + confirmación permiten comprender y decidir.

### P3 — Cambiar modo y liberar tienen consecuencia económica

**No** se presentan como cambios de campos. Antes de ejecutar `liberar`, la UX muestra (proyección read-only, F5-0 lo cubre también para liberar):

- **cuánto se revierte** de `Pedido.total` (`montoRevertidoProyectado`)
- **qué permanece** (si hubo un diferencial negativo ya acreditado a `Cliente.saldoFavor` que **no** se revierte)
- **qué pasa con `Cliente.saldoFavor`** (importe que queda a favor)
- **la consecuencia económica final** (saldo del pedido después, saldo a favor del cliente después)

Regla: **no aparentar una reversión completa cuando no existe.** Si el negativo a `saldoFavor` es material, se muestra **antes o durante** la decisión, y el resultado (tras la mutación) es **inequívoco** (§criterios: "resultado final inequívoco después de cada mutación").

`cambiar-modo` — igual: muestra la reversión del modo anterior + el nuevo diferencial + la consecuencia neta, y el mismo aviso del negativo no revertido.

### P4 — Frontera N2 ↔ nueva demanda ↔ VENTA_LIBRE (explícita, sin inferencia)

**Ejemplo obligatorio:** `Pedido 20 · Entregado 15 · Pendiente 5`. Aparece una solicitud adicional durante una ruta.

La interfaz **no** asume que esa solicitud es "completar el pendiente". Ofrece **tres opciones declaradas por el usuario**:

| Opción | Qué es | A dónde va |
|---|---|---|
| **Completar el pendiente** | cumplir la obligación existente de 5 | `gestionar-pendiente` (o cumplimiento de la actividad) |
| **Nueva demanda** | el cliente pide MÁS (independiente del pendiente) | `Pedido` nuevo con `pedidoOrigenId` (G11.B) — reusa el workspace |
| **Venta durante la ruta** | operación surgida en contexto de Embarque | flujo de Venta Libre (Embarques — §doc VENTA_LIBRE_EXPERIENCIA_HUB) |

**Recordatorios que la UX debe respetar:** corrección ≠ nueva demanda · nueva demanda = nuevo Pedido · Venta Libre = operación en contexto de Embarque · Venta Libre **no** modifica silenciosamente el Pedido ni completa artificialmente un pendiente. La distinción es **una declaración explícita del usuario**, nunca una inferencia del sistema.

En F5, el `PedidoExceptionPanel` que gestiona el pendiente incluye, junto a "Completar el pendiente", accesos claros a "Nueva demanda" y "Venta durante la ruta" (los dos últimos navegan a su flujo, no ejecutan — igual que el command menu de Fase 4b).

### P5 — `modoInicial` es una **PROPUESTA**, no una decisión

`gestionar-pendiente` recibe `modoInicial` del cliente; **no hay default en el backend**. → el frontend propone `modoInicial = Pedido.canal` con microcopy **"Propuesto según el pedido original"**. El usuario puede cambiarlo (`PUNTO`/`DOMICILIO`) cuando las reglas lo permitan. El cambio de modo recalcula el diferencial proyectado (F5-0) antes de confirmar.

### P6 — Realtime selectivo

`useRealtimeListener` **no** refresca todo el peek ante cualquier `pedido.*`. Dependencias reales:

| Evento | Qué invalidar del peek capa 2 |
|---|---|
| `pedido.updated` (mismo id) | `pendienteN2`, `total`/`saldo`/`estadoPago` del pedido, diferencial mostrado |
| `pago.created` (mismo pedido) | `saldo`/`estadoPago`, `factura` |
| `embarque.updated` (embarque del pedido o de una actividad) | `embarqueResumen`, `actividades[].embarqueId` |
| `route_plan.updated` | nada del peek de un pedido concreto |
| otros | nada |

`invalidatePeek(id)` ya existe (Fase 4b); F5 lo llama **solo** cuando el evento afecta a `id`. Las mutaciones N2 (`gestionar-pendiente`/`cambiar-modo`/`liberar`) refrescan el peek localmente al recibir la respuesta (no dependen del realtime).

### P7 — "Fuera de alcance: N2 en el path del repartidor" — precisado

Se distingue:
- **Gestionar N2** (crear obligación, cambiar modo, liberar, aplicar diferencial) → **administración** (ADMIN/ASISTENTE). Fuera del alcance de F5 para el repartidor.
- **Conocer el estado de una obligación pendiente durante la operación** → capacidad de **visibilidad contextual** para el repartidor. **Existe en el dominio** (`Actividad.embarqueId`, `pendienteN2` en el pedido). **Queda fuera de F5 como alcance explícito**, no como inexistencia — se retoma cuando se aborde la consolidación de `/repartidor` (blueprint §8.3).

**Alcance de F5 (declarado):** experiencia de N2 en el Pedido Hub para ADMIN/ASISTENTE (peek + gestión). No toca `/repartidor`. No toca los endpoints N2. No decide la política del diferencial negativo (PENDIENTE §8.2).

---

## 2. Matriz de casos (criterio de éxito por caso)

`main` = estado hoy · `F5` = qué cubre la fase.

| # | Caso | Criterio de éxito (experiencia) | Cubre |
|---|---|---|---|
| N2-01 | Pedido parcialmente entregado | El peek capa 1 dice "Entregado 15 de 20 · 5 pendientes" sin abrir nada | F5-i |
| N2-02 | Existe remanente, sin obligación | El panel ofrece "Completar el pendiente" (+ "Nueva demanda" / "Venta durante la ruta") — no asume cuál | F5-i + F5-ii |
| N2-03 | Completar **parcialmente** el remanente | El usuario elige `cantidad < remanente`; la obligación nace por esa cantidad; el remanente restante sigue visible | F5-ii |
| N2-04 | Completar **totalmente** el remanente | `cantidad = remanente`; la obligación cubre todo | F5-ii |
| N2-05 | Varias actividades sobre un mismo pendiente | El panel lista `actividades[]` con su `modo`/`estado` por separado; no las funde | F5-i |
| N2-06 | Cambio de modo | Antes de ejecutar: proyección (reversión del modo anterior + nuevo diferencial + consecuencia neta). Después: resultado inequívoco | F5-0 + F5-iii |
| N2-07 | Liberación | Antes: cuánto se revierte / qué permanece / `saldoFavor` / consecuencia final + motivo obligatorio. Después: `montoRevertido` real + estado inequívoco | F5-0 + F5-iii |
| N2-08 | Diferencial **positivo** | "Cobro adicional de $X — se suma al pedido; se cobra por cartera". El saldo del pedido sube | F5-0 + F5-ii |
| N2-09 | Diferencial **negativo** | "Ajuste a favor de $X — se acredita al saldo a favor del cliente. El total del pedido no baja." | F5-0 + F5-ii |
| N2-10 | Diferencial negativo **ya reflejado en `saldoFavor`** (al liberar / re-cambiar modo) | "Se revierten $A de este pedido. Los $B ya acreditados al saldo a favor del cliente **permanecen** (no se revierten automáticamente)." — inequívoco, no aparenta reversión total | F5-0 + F5-iii |
| N2-11 | Conflicto / concurrencia | `409` (`OBLIGACION_YA_ACTIVA` / `CANTIDAD_EXCEDE_PENDIENTE`) → mensaje del backend + "actualizá y reintentá"; el panel se refresca | F5-ii/iii |
| N2-12 | Offline / idempotencia | La acción se encola (`fetchResilient`), el `offlineId` deduplica el replay; la UX dice "se aplicará al recuperar conexión" | F5-ii/iii |
| N2-13 | Pedido que **ya no admite** la operación | El panel **no ofrece** "Completar el pendiente" (o lo deshabilita con el motivo) según `estadoEntrega` | F5-i |
| N2-14 | Pedido **cerrado/cancelado/anulado** con obligación abierta | Inconsistencia (P1): el panel lo marca "revisar", no ofrece gestión | F5-i |
| N2-15 | Relación con nueva demanda | "Nueva demanda" navega al workspace con `pedidoOrigenId` — declaración explícita, no inferencia | F5-ii |
| N2-16 | Relación con Venta Libre | "Venta durante la ruta" navega a su flujo — no modifica el pedido | F5-ii |
| N2-17 | Reutilización de datos conocidos | producto/cantidad/modo se pre-rellenan del remanente y del pedido (propuesta), no se re-piden | F5-ii |
| N2-18 | Error de backend (5xx) | Mensaje neutro + "reintentá"; el panel no queda en estado inconsistente | F5-ii/iii |
| N2-19 | Estado stale / realtime | `pedido.updated` del mismo id → el peek invalida y recarga; una acción sobre datos stale → `409` → §N2-11 | F5-i (P6) |
| N2-20 | Resultado final inequívoco tras cada mutación | Después de `gestionar-pendiente`/`cambiar-modo`/`liberar`: el panel muestra el estado nuevo (obligación, actividades, diferencial aplicado, saldo del pedido, saldo a favor) sin ambigüedad | todas |

---

## 3. Slices

### F5-0 — `POST /api/pedidos/[id]/gestionar-pendiente/preview` (proyección read-only)

**Files:**
- Create: `src/app/api/pedidos/[id]/gestionar-pendiente/preview/route.ts`
- Create: `src/modules/embarques/application/use-cases/ProyectarGestionPendienteUseCase.ts`
- Modify: `src/lib/validators.ts` (`ProyectarGestionPendienteSchema`)
- Test: `.../__tests__/route.test.ts`, `.../__tests__/ProyectarGestionPendienteUseCase.test.ts`, integración

**Contrato:**
```
POST /api/pedidos/[id]/gestionar-pendiente/preview
body: { producto, cantidad, modoDestino: 'PUNTO'|'DOMICILIO', accion: 'gestionar'|'liberar', actividadId? }
→ 200 {
  remanente: number,
  diferencial: { valorHistorico, valorActual, diferencial },        // acción 'gestionar' o 'cambiar-modo'
  reversion?: { montoRevertible: number, saldoFavorNoRevertido: number },  // acción 'liberar'
  consecuencia: {
    pedidoTotalDespues, pedidoSaldoDespues, clienteSaldoFavorDespues,
    tipo: 'cobro_adicional' | 'ajuste_a_favor' | 'sin_ajuste' | 'reversion_parcial' | 'reversion_total'
  },
  allowedActions: Array<'gestionar' | 'cambiar-modo' | 'liberar'>,
  warnings: Array<{ code, message }>,      // NO_ADMITE_GESTION, OBLIGACION_YA_ACTIVA, CANTIDAD_EXCEDE_PENDIENTE
}
errores: 404 PEDIDO_NOT_FOUND / PEDIDO_ITEM_NOT_FOUND
```
Read-only: compone `calcularDiferencial` + lecturas de `Pedido`/`PedidoItem`/`Cliente`/`ObligacionPendiente`. Nunca `$transaction` de escritura, nunca lock. Guardrail estático + test comportamental (snapshot antes/después == igual).

**Commit:** `feat(pedidos): proyección read-only de gestión de pendiente (N2) — Fase 5-0`

### F5-i — `use-pendiente-n2` + `PedidoExceptionPanel` (display)

**Files:**
- Create: `src/app/(app)/pedidos/pedido-hub/pedido-exception-panel.tsx`
- Create: `src/app/(app)/pedidos/pedido-hub/n2-naturaleza.ts` (clasifica P1: normal/excepción/conflicto/inconsistencia/riesgo)
- Modify: `peek-relaciones.tsx` (reemplaza el stub por `<PedidoExceptionPanel>`), `peek-panel.tsx` (capa 1: "Entregado X de Y · Z pendientes"), `derive-operacion.ts` si hace falta el resumen
- Modify: `pedido-hub/index.tsx` — `useRealtimeListener` selectivo (P6)
- Test: `__tests__/pedido-exception-panel.test.tsx`, `__tests__/n2-naturaleza.test.ts`

**Qué hace:** muestra `pendienteN2` con su naturaleza (P1), lista `actividades[]` por separado (N2-05), capa 1 con el resumen de entregado/pendiente (N2-01). Si hay remanente y no hay obligación → CTA "Completar el pendiente" + accesos "Nueva demanda" / "Venta durante la ruta" (P4, navegan). Si el pedido no admite la gestión (N2-13/14) → no ofrece el CTA (o lo deshabilita con motivo). **Cero mutación en F5-i.**

**Commit:** `feat(pedidos): PedidoExceptionPanel — N2 en el peek (display) — Fase 5-i`

### F5-ii — Flujo "Completar el pendiente" (semántica B)

**Files:**
- Create: `src/app/(app)/pedidos/pedido-hub/completar-pendiente-form.tsx`
- Create: `src/app/(app)/pedidos/pedido-hub/use-gestion-pendiente.ts` (proyección → confirm)
- Modify: `pedido-exception-panel.tsx`
- Test: unit + Playwright en vivo

**Flujo:** CTA → form (producto/cantidad ≤ remanente / modo propuesto = `pedido.canal` con microcopy P5) → **on change** → `POST .../preview` (F5-0) → muestra el **impacto estimado** (diferencial + consecuencia, con el lenguaje de N2-08/09) → `[Confirmar]` → `POST gestionar-pendiente` → panel refrescado con el **resultado inequívoco** (N2-20). `409`/`5xx` → mensajes (N2-11/18). Offline → encolado (`fetchResilient`, N2-12).

**Commit:** `feat(pedidos): flujo "completar el pendiente" (impacto → confirmar) — Fase 5-ii`

### F5-iii — `[Cambiar modo]` / `[Liberar]`

**Files:**
- Create: `src/app/(app)/pedidos/pedido-hub/actividad-acciones.tsx`
- Modify: `pedido-exception-panel.tsx`, `use-gestion-pendiente.ts`
- Test: unit + Playwright

**Flujo cambiar modo:** `[Cambiar modo]` sobre una actividad → selector `PUNTO`/`DOMICILIO` → `preview` (`accion: 'cambiar-modo'`) → impacto (reversión anterior + nuevo diferencial + consecuencia neta + aviso negativo-no-revertido, P3) → `[Confirmar]` → `POST cambiar-modo` → resultado inequívoco.

**Flujo liberar:** `[Liberar]` → `preview` (`accion: 'liberar'`) → **antes de decidir**: cuánto se revierte / qué permanece / `saldoFavor` / consecuencia final (P3, N2-07/10) → `motivo` **obligatorio** (min 1) → `[Liberar]` → `POST liberar` → `montoRevertido` real + estado inequívoco.

**Commit:** `feat(pedidos): cambiar modo / liberar actividad con consecuencia económica explícita — Fase 5-iii`

---

## 4. Criterio de éxito de fondo (verificación antes de cerrar F5)

**No** basta "el panel funciona y los endpoints responden". Se verifica (Playwright en vivo + unit) que un usuario puede:
1. comprender qué parte del pedido sigue pendiente (sin abrir nada — capa 1);
2. ver qué propone el sistema (modo propuesto, marcado como propuesta);
3. saber qué decisión está tomando (completar / nueva demanda / venta libre — nunca ambiguo);
4. ver la consecuencia económica **antes** (proyección) y **después** (resultado inequívoco);
5. entender qué ocurrió con `Pedido.total` y con `Cliente.saldoFavor`, incluido el caso del negativo no revertido.

Y que la interfaz **nunca** fusiona completar-pendiente / corregir / nueva-demanda / venta-libre en una operación ambigua.

---

## 5. Fuera de alcance (no reabrir)

- Los endpoints N2 (`gestionar-pendiente`/`cambiar-modo`/`liberar`) — fijos.
- Política del diferencial negativo no revertido — PENDIENTE de negocio (blueprint §8.2). F5 lo **muestra**, no lo resuelve.
- N2 en `/repartidor` — alcance explícito fuera (P7); la capacidad existe en el dominio.
- `AsignarActividadUseCase` y su endpoint (`POST /api/obligaciones/[id]/asignar`) — no se integra en F5 (es asignación a embarque, otro flujo).
