# Fase 9 — Hardening de estados del Pedido Hub

> **For agentic workers:** slices F9-i → F9-ii → F9-iii → F9-iv. TDD, commits frecuentes. Detrás de `NEXT_PUBLIC_PEDIDOS_V2` (OFF). **Base:** `feat/pedidos-fase8-recurrentes`. Rebasar sobre `main` cuando la cadena Fase 7/8 mergee.

**Goal:** que el Hub represente **el estado real** en cada momento — carga, vacío, error, offline, "actualizando", conflicto — sin mentir. Nunca `ErrorState` si había datos; nunca "confirmado" sin confirmación server-side (G9); `online + stale` se ve como "actualizando", no como error.

**Blueprint:** §4.7 (catálogo explícito de estados), §4.8 (lazy ≠ ocultar). **Gate:** G9 (offline muestra estado real; mutación encolada = "pendiente", no "confirmado").

---

## 0. Contexto técnico (investigación, 2026-09-08)

### Qué YA está bien

| Estado | Dónde | OK |
|---|---|---|
| `loading` (sin datos) | `pedido-hub/index.tsx:142` — skeleton `pedido-hub-skeleton` | ✅ |
| `error` **sin datos** | `index.tsx:140` — `EmptyState` + `onRetry` | ✅ |
| `offline` **con datos** | `index.tsx:137,168` — badge "sin conexión, se sincroniza"; datos intactos | ✅ |
| `empty` | `operacion-list.tsx:136` — `EmptyState` "No hay operaciones · Ajustá los filtros o creá una nueva" | ✅ (verificar acción) |
| peek `↑/↓` cancela fetch stale | `use-peek.ts:32,44,49` — `reqRef` descarta resultados de navegaciones previas | ✅ (falta test explícito) |
| realtime selectivo | `index.tsx:95` (F5-i/F7-iii) — `pedido.*`/`pago.*` invalidan el peek de ese id; `embarque.*` solo si el peek abierto lo usa | ✅ |
| `mutation pending` | F5/F6 forms — `confirmando` → "Aplicando…", botón disabled | ✅ (el resto de la UI sigue usable) |
| 409 con `offlineId` dedup | endpoints N2/G11/venta-libre/recurrentes → 200/return-existente | ✅ |

### Brechas que Fase 9 cierra

| # | Brecha | §4.7 |
|---|---|---|
| **B1** | **`stale` / "actualizando…" no se representa.** `use-pedidos` no expone `refetching`; el Hub recibe `loading={!hasLoadedOnce && loading}` → un refetch de fondo (realtime → `refreshPedidos`) es **invisible**. El usuario no sabe que los datos pueden estar cambiando. | fila `stale` |
| **B2** | **`error` CON datos previos se traga.** Si `fetchError` se setea pero `pedidos.length > 0`, el Hub renderiza la lista normal — sin "no se pudo actualizar · reintentar". | fila `error` ("si había datos previos, se conservan" + mensaje + retry) |
| **B3** | **409 sin dedup → no hay recovery contextual.** F5 (`use-gestion-pendiente`) y F6 (`use-ajuste-cantidad`) devuelven `conflicto`/`guard` en 409, pero el form solo muestra el **texto** del error (`completar-error`). Falta el flujo `conflict → refresh peek + comparar + revisar` (ALS §6). El prop `conflictoEnCurso` de `PedidoExceptionPanel` existe pero **no está wireado**. | fila `mutation conflict` |
| **B4** | **Catálogo de estados sin tests de unidad como contrato.** No hay un test que fije "offline ≠ stale", "409 no-dedup → recovery no éxito", "online + stale = actualizando no error". | §4.7 pruebas |
| **B5** | **E2E offline incompleto.** `pedidos-hub.spec.ts` prueba "badge + datos intactos" pero NO "mutación encolada muestra pendiente, no confirmado" (G9 literal). | G9 |

### Lo que NO se toca

- El SSR / `loading.tsx` de `/pedidos` (ya existe, KI #15).
- La estrategia de caché del peek (`panel-prefetch` TTL/LRU) — se mantiene.
- Los endpoints. La idempotencia por `offlineId` ya está.
- `fetchResilient` / `requestQueue` / `syncWithServer` — el hardening es de **presentación** de estados, no del mecanismo offline.
- No se inventan estados nuevos fuera del catálogo §4.7.

---

## 1. Precisiones a respetar

| # | Precisión |
|---|---|
| **P1** | `offline` ≠ `stale` ≠ `error`. Offline = red no contactable (heurística `navigator.onLine` **+** resultado real de requests). Stale = hay datos, puede haber uno más nuevo (evento realtime / refetch en vuelo), **coexiste con online**, no bloquea. Error = un fetch falló y **no** es error de lógica. |
| **P2** | **Nunca `ErrorState` si ya había datos.** Error con datos → chip sutil + retry, la lista/peek siguen visibles y usables. |
| **P3** | **Nunca "confirmado" sin confirmación server-side (G9).** Una mutación encolada offline → toast `info` "se aplicará al reconectar" / marca "pendiente", jamás `success` "confirmado". |
| **P4** | **409 sin dedup = recovery, no éxito.** Refresh del contexto (peek) + el usuario compara + decide. NO se auto-reintenta. NO se muestra como si hubiera funcionado. |
| **P5** | **`stale` es sutil.** "actualizando…" pequeño, sin spinner que tape contenido, sin bloquear interacción. |
| **P6** | El catálogo de estados §4.7 es la única fuente. No se agregan estados nuevos. |

---

## 2. Slices

### F9-i — estado `refetching` / "Actualizando…" — ✅ IMPLEMENTADO (aprobado con precisiones del equipo)

**Precisiones del equipo incorporadas:**
- `loading` (carga inicial, sin respuesta utilizable) y `refetching` (actualización con datos ya presentes) son **estados distintos**. Durante refetch: lista conservada, sin skeleton, `loading=false`, `refetching=true`. `refetching` NO sustituye a `loading`.
- `refetching` ≠ `stale` ≠ `offline` ≠ `error`. No hay estado combinado. `refetching` es **estado interno del hook**, no un estado de dominio del Pedido.
- La protección contra respuestas stale (`AbortController` + `requestIdRef` + `isCurrent()`) se preserva: una respuesta cancelada/obsoleta no toca `pedidos`/`total`/`error`/`refetching` (el `finally` que resetea ambos flags está guardado por `isCurrent()`).
- `offline` no se representa como `refetching`: el indicador del Hub se gatea sobre `isOnline`.

**Archivos:**
- `src/hooks/use-pedidos.ts` — nuevo estado `refetching`; `hasLoadedOnceRef` (espejo de `hasLoadedOnce` en ref, para decidir loading-vs-refetching sin recrear la identidad de `fetchPedidos`); `finally { if (isCurrent()) { setLoading(false); setRefetching(false) } }`. `UsePedidosResult += refetching: boolean`.
- `pedidos-client/index.tsx` — `mainRefetching` state envolviendo `refreshPedidos()` (el entrypoint único de refetch de la lista principal: polling, realtime, post-mutación); se pasa como `refetching={mainRefetching}` al `<PedidoHub>`.
- `pedido-hub/index.tsx` — prop `refetching?: boolean`; `mostrarActualizando = refetching && isOnline && !(loading && pedidos.length === 0)`; chip `data-testid="pedido-hub-actualizando"` sutil (texto gris, punto animado, `aria-live="polite"`), junto al badge offline.
- Tests: `src/hooks/__tests__/use-pedidos.test.ts` (3 casos funcionales con fetch diferido: criterios 1-2, 3-6, 7 + 1 source-check del `finally`) · `src/app/(app)/pedidos/pedido-hub/__tests__/estados-catalogo.test.tsx` (6: skeleton sin indicador, refetching→indicador+lista, normal sin indicador, offline no-indicador, offline con datos, error sin datos).

**Criterios de aceptación (los 10 del equipo) — verificados:** primera carga→`loading`; cargada→ambos false; refetch con datos→`loading=false`/`refetching=true`; lista visible durante refetch; indicador visible; refetch OK→indicador desaparece; refetch fallido→lista intacta + `error` disponible para F9-ii; stale no pisa estado; offline no es refetching; sin nuevo estado de dominio.

### F9-ii — `error` con datos previos — ✅ IMPLEMENTADO

**Precisión del equipo (#4):** con `pedidos.length > 0 && error` NO usar `ErrorState` ni borrar la lista; mostrar "No se pudo actualizar · Reintentar" conservando los datos.

**Archivos:**
- `pedido-hub/index.tsx` — `errorConDatos = Boolean(error) && pedidos.length > 0 && !mostrarActualizando` → chip `data-testid="pedido-hub-error-datos"` ("No se pudo actualizar" + botón "Reintentar" → `onRetry`), en la fila de estado del header. `listNode` sigue mostrando `OperacionList` (solo hay `EmptyState` con `errorSinDatos` = error **y** sin datos). Si hay un reintento en curso, `mostrarActualizando` gana y el chip de error se oculta (transición limpia: `usePedidos` limpia `error` al arrancar el fetch).
- `pedidos-client/index.tsx` — el banner ámbar legacy (`showErrorBanner`) y su `toast.error` se suprimen en `hubMode` (`&& !hubMode`): el Hub es la única representación del estado, sin doble mensaje ni toast por cada poll fallido (cada 60s).
- Tests (`estados-catalogo.test.tsx`, +2): error+datos → chip + Reintentar (llama `onRetry`), lista intacta, sin EmptyState · error+datos+refetch en curso → "Actualizando…" gana, chip de error oculto.

**Criterio:** un refetch que falla teniendo datos → los datos quedan, aparece "No se pudo actualizar · Reintentar"; clic → reintenta.

### F9-iii — recovery de conflicto (409 de concurrencia) — ✅ IMPLEMENTADO (precisión #5 del equipo)

**A vs B (precisión #5):**
- **A — 409 de concurrencia/estado** (algo cambió mientras editabas): recovery contextual → refresca el contexto (peek), `conflictoEnCurso`, "Ver estado actual", **NO** auto-retry, **NO** éxito.
- **B — 409 de regla de negocio ya explicada**: conserva su código + mensaje contextual, **no** se generaliza a "conflicto".
- `conflictoEnCurso` = conflicto de concurrencia pendiente de revisión, **no** cualquier HTTP 409.

**Clasificación de los 409 reales del backend:**
| Endpoint | Código 409 | Clase |
|---|---|---|
| `gestionar-pendiente` | `CANTIDAD_EXCEDE_PENDIENTE` | B (regla) |
| `gestionar-pendiente` | `OBLIGACION_YA_ACTIVA` | A (otra sesión la creó) |
| `cambiar-modo` / `liberar` | `ACTIVIDAD_NO_MODIFICABLE` | A (estado cambió) |
| `cambiar-modo` | `ACTIVIDAD_SIN_MODO` | B (regla) |
| `ajustar-cantidad` | `CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA` / `CORRECCION_PEDIDO_CERRADO` / `CORRECCION_GENERARIA_SOBREPAGO` | B (guard G11, ya con alternativas) |
| cualquiera | 409 sin código reconocido | A (default seguro) |

**Archivos:**
- `use-gestion-pendiente.ts` — `MutarResultado += { conflicto?, reglaNegocio? }`. `N2_REGLA_NEGOCIO_409 = ['CANTIDAD_EXCEDE_PENDIENTE', 'ACTIVIDAD_SIN_MODO']`; `conflicto = es409 && !reglaNegocio` (default: 409 desconocido → conflicto). Antes: `conflicto = statusCode === 409` (todo 409 → genérico — violaba B).
- `use-ajuste-cantidad.ts` — `ConfirmarCorreccionResultado += conflicto?` = `409 && !guard` (hoy inalcanzable; defensa simétrica).
- `completar-pendiente-form.tsx` / `actividad-acciones.tsx` — prop `onConflicto?`; en `r.conflicto` → estado local `conflicto` + `onConflicto()`. Banner `data-testid="completar-conflicto"` / `"actividad-conflicto"` ("Esta operación/actividad cambió mientras la editabas…") con botón `"…-ver-estado"` → `onMutado` (refresca el contexto, **no** reintenta el commit). `puedeConfirmar && !conflicto`. El banner reemplaza al `…-error` crudo. Se limpia al cambiar cualquier input.
- `correccion-cantidad-form.tsx` — `commitConflicto` atado a `sig` (mismo patrón que `commitGuard`); banner `data-testid="correccion-conflicto"` + `"correccion-ver-estado"`. Los 3 guards G11 siguen mostrando su mensaje + alternativas (B, sin cambios).
- `pedido-exception-panel.tsx` — `conflictoLocal` state; `onConflicto={() => setConflictoLocal(true)}` a ambos forms; `enConflicto = conflictoEnCurso || conflictoLocal` → `clasificarN2({ conflictoEnCurso: enConflicto })` → naturaleza `'conflicto'` (ámbar). El prop externo `conflictoEnCurso` deja de ser un prop muerto. `onMutado` de los sub-forms también hace `setConflictoLocal(false)`.
- Tests: `use-gestion-pendiente.test.ts` (nuevo, 6: matriz A/B/500/ok/offline) · `use-ajuste-cantidad.test.ts` (+2: 409 sin guard → conflicto; 500 → nada) · `completar-pendiente-form.test.tsx` (+2: 409 concurrencia → recovery sin éxito sin auto-retry; 409 regla → mensaje contextual) · `actividad-acciones.test.tsx` (+1) · `correccion-cantidad-form.test.tsx` (+1) · `pedido-exception-panel.test.tsx` (+1: 409 en acción de actividad → naturaleza 'conflicto').

**Criterio:** dos usuarios editan el mismo pendiente; el segundo commit → 409 `OBLIGACION_YA_ACTIVA` → el form muestra "cambió mientras la editabas · Ver estado actual", NO "aplicado", NO reintenta. El peek se refresca al pedirlo. Un 409 `CANTIDAD_EXCEDE_PENDIENTE` sigue mostrando su mensaje contextual, sin recovery.

### F9-iv — catálogo de estados como contrato + E2E
**Archivos:**
- `src/app/(app)/pedidos/pedido-hub/__tests__/estados-catalogo.test.tsx` — unit del catálogo: `offline` (con datos → badge, sin ErrorState) · `stale` (online + refetching → "actualizando", no error) · `error` con datos (chip+retry) vs sin datos (EmptyState) · `empty` (EmptyState con acción) · `loading` inicial (skeleton).
- `src/app/(app)/pedidos/pedido-hub/__tests__/use-peek.test.ts` — extender: `nav('next')` mientras un fetch de capa 2 está en vuelo → el resultado del anterior se descarta (ya lo hace `reqRef`; test explícito).
- `e2e/pedidos-hub-estados.spec.ts` (gated): (a) red cortada tras cargar → badge, filas intactas, sin pantalla de error; (b) mutación N2 encolada offline → la UI dice "se aplicará al reconectar" / "pendiente", **nunca** "confirmado"/"aplicado"; (c) `↑/↓` rápido en el peek no deja capa 2 de otra operación.
- **Verificación (grep, §4.7):** cero `fetch(` por foco · el peek capa 1 no dispara fetch · un 409 swithout `offlineId` match muestra recovery no "éxito" · `stale` se representa como "actualizando" no como error.

**Criterio (G9):** E2E offline verde; el grep de verificación pasa; el catálogo de estados tiene un test por fila.

---

## 3. Criterios de éxito (globales)

1. En cualquier momento el Hub muestra **un** estado del catálogo §4.7 que corresponde a la realidad (nunca "error" con datos, nunca "confirmado" sin server).
2. Un refetch de fondo es **visible** ("actualizando…") pero **no bloquea**.
3. Un fallo de refetch con datos → los datos quedan + retry.
4. Un 409 que no es dedup → recovery contextual (refresh + revisar), no "éxito".
5. Offline: badge, datos en memoria intactos, mutaciones encoladas marcadas "pendiente".

## 4. Fuera de alcance (no reabrir)

- `fetchResilient` / `requestQueue` / `syncWithServer` (mecanismo offline — ya cerrado).
- La caché del peek (`panel-prefetch` TTL/LRU).
- El SSR / `loading.tsx` de `/pedidos`.
- Estados nuevos fuera del catálogo §4.7.
- La política de reintentos automáticos (no hay — el usuario decide, P4).
