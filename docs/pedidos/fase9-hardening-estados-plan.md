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
- **`conflicto-409.ts` (nuevo) — clasificación CENTRALIZADA (criterio de cierre #1)**. `es409DeConflictoDeEstado(status, msg)` / `es409DeReglaDeNegocio(status, msg)` + `CODIGOS_409_REGLA_NEGOCIO` (los 5 de la tabla) + `CODIGOS_409_CONFLICTO_ESTADO` (documental). Única fuente de verdad; la usan los dos hooks. Default seguro: 409 con código no reconocido → conflicto de estado.
- `use-gestion-pendiente.ts` — `MutarResultado += { conflicto?, reglaNegocio? }`, ambos derivados de `conflicto-409`. Antes: `conflicto = statusCode === 409` (todo 409 → genérico — violaba B).
- `use-ajuste-cantidad.ts` — `ConfirmarCorreccionResultado += conflicto?` = `es409DeConflictoDeEstado(...)` (mismos códigos; los 3 guards G11 caen en B → `conflicto` false, `guard` set).
- `completar-pendiente-form.tsx` / `actividad-acciones.tsx` — prop `onConflicto?`; en `r.conflicto` → estado local `conflicto` + `onConflicto()`. Banner `data-testid="completar-conflicto"` / `"actividad-conflicto"` con **lenguaje neutral de estado cambiado** (criterio #2: *"El estado en el servidor ya no coincide con lo que ves acá"* — NO se afirma "otro usuario"). Botón `"…-ver-estado"` → `onMutado` → (en el Hub) `invalidatePeek(activeId)` + `peek.open(p)` + `onRefetch()` = **recarga real del peek** (criterio #3). `puedeConfirmar && !conflicto` (criterio #4). El banner reemplaza al `…-error` crudo. Se limpia al cambiar cualquier input (criterio #4: nueva intención del usuario).
- `correccion-cantidad-form.tsx` — `commitConflicto` atado a `sig`; banner `data-testid="correccion-conflicto"` + `"correccion-ver-estado"`. Los 3 guards G11 siguen con su mensaje + alternativas que el usuario elige (B, sin cambios — criterio #5).
- `pedido-exception-panel.tsx` — `conflictoLocal` state; `onConflicto` a ambos forms; `enConflicto = conflictoEnCurso || conflictoLocal` → `clasificarN2({ conflictoEnCurso: enConflicto })` → naturaleza `'conflicto'` (criterio #6). El prop externo `conflictoEnCurso` deja de ser un prop muerto. `onMutado` de los sub-forms también hace `setConflictoLocal(false)`.
- `n2-naturaleza.ts` — título/detalle de la naturaleza `'conflicto'` con lenguaje neutral de estado.

**Tests (criterio de cierre #7) — todos verdes:**
| Demostración | Test |
|---|---|
| cada código A → conflicto (recovery) | `conflicto-409.test.ts` (`it.each` sobre `CODIGOS_409_CONFLICTO_ESTADO`) + `use-gestion-pendiente.test.ts` (`OBLIGACION_YA_ACTIVA`, `ACTIVIDAD_NO_MODIFICABLE`) |
| cada código B → regla, sin recovery | `conflicto-409.test.ts` (`it.each` sobre `CODIGOS_409_REGLA_NEGOCIO`) + `use-gestion-pendiente.test.ts` (`CANTIDAD_EXCEDE_PENDIENTE`, `ACTIVIDAD_SIN_MODO`) |
| 409 desconocido → recovery (default) | `conflicto-409.test.ts`, `use-gestion-pendiente.test.ts`, `use-ajuste-cantidad.test.ts` |
| 500 / 403 → error técnico, no conflicto | `conflicto-409.test.ts`, `use-gestion-pendiente.test.ts`, `use-ajuste-cantidad.test.ts` |
| recovery → recarga real del peek | `use-peek.test.ts` ("invalidatePeek + re-open → re-fetch, `estado-1`→`estado-2`, 2 fetch") |
| recovery → nunca commit automático | `completar-pendiente-form.test.tsx`, `use-gestion-pendiente.test.ts` ("un 409 A NO dispara un segundo commit"), `correccion-cantidad-form.test.tsx` (`frMock` 1×) |
| recovery → nunca success | `completar-pendiente-form.test.tsx` (`onMutado` no llamado hasta "Ver estado actual"), `use-gestion-pendiente.test.ts` |
| dos operaciones concurrentes → 2ª recibe recovery | `use-gestion-pendiente.test.ts` (`OBLIGACION_YA_ACTIVA`), `completar-pendiente-form.test.tsx` |
| conflicto bloquea el commit; input nuevo lo limpia | `completar-pendiente-form.test.tsx` ("al cambiar un input tras el conflicto → se limpia") |
| G11 `CORRECCION_*` mantiene las alternativas | `correccion-cantidad-form.test.tsx` (guard proyectado + guard del commit; `onIrANuevaDemanda` solo con click explícito) |
| ningún camino auto-convierte corrección en nueva demanda/Venta Libre | `correccion-cantidad-form.test.tsx` (`onIrANuevaDemanda`/`onMutado` no llamados en guard 409) |

**Criterio:** commit → 409 `OBLIGACION_YA_ACTIVA` → el form muestra "El estado en el servidor ya no coincide… · Ver estado actual", NO "aplicado", NO reintenta; "Ver estado actual" invalida y recarga el peek con el estado del servidor. Un 409 `CANTIDAD_EXCEDE_PENDIENTE` sigue con su mensaje contextual, sin recovery. Un guard G11 mantiene sus alternativas y nunca convierte la intención.

### F9-iv — catálogo de estados como contrato + E2E — ✅ IMPLEMENTADO

**Archivos:**
- `estados-catalogo.test.tsx` (+4 → 11) — contrato §4.7: `loading` (skeleton, sin "Actualizando…") · `stale`/`refetching` (online → "Actualizando…", no error; offline → no aparece) · `error` con datos (chip + Reintentar, lista intacta) vs sin datos (EmptyState) · `offline` con datos (badge, filas, sin ErrorState) · `empty` (query válida, 0 resultados → "No hay operaciones", nunca en blanco) · `retry` (botón dispara `onRetry`) · **guard "sin estados inventados"**: el contenido principal es exactamente uno de `{skeleton, empty, lista}`; con datos + error la lista NUNCA se reemplaza por una "pantalla de error".
- `use-peek.test.ts` (+2) — (a) recovery: `invalidatePeek` + re-open → re-fetch real (`estado-1`→`estado-2`); (b) `↑/↓`: un fetch de capa 2 que **resuelve tarde** (tras `nav('next')`) se **descarta** — el peek nunca muestra el resultado stale (`p1-STALE`).
- `e2e/pedidos-hub.spec.ts` (+1, gated `NEXT_PUBLIC_PEDIDOS_V2`) — **G9**: (1) online → commit confirmado por el servidor (fila visible); (2) offline → nueva mutación → *"se enviará al recuperar la red"* visible, **`toHaveCount(0)`** de `/pedido creado|confirmado/`; (3) reconexión → el sync drena la cola → el pedido termina en el servidor (`GET` con ≥2). El caso "offline: badge, datos intactos, sin pantalla de error" ya existía en este spec.
- **Verificación (grep §4.8) — pasa:** ningún `fetch`/`refetch` atado a la selección de foco (filtro en memoria, `pedidosFiltrados` useMemo) · `use-peek` capa 1 = `pedidos.find(...)`, cero fetch · 409 sin `offlineId` coincidente → recovery no "éxito" (F9-iii) · `online + stale` → "Actualizando…", no error (F9-i).

**Criterio (G9):** unit del catálogo con un test por fila + guard anti-estados-inventados · `↑/↓` cancela el fetch stale (test explícito) · E2E G9 con la secuencia completa online-confirmado → offline-pendiente → reconexión-sync. Suite `pedidos/` + `use-pedidos` = **218 verdes**, `tsc`/`eslint` limpios.

---

> **Estado: Fase 9 COMPLETA** — F9-i (`refetching`), F9-ii (`error` con datos), F9-iii (recovery de conflicto 409, cierre con los 7 criterios del equipo), F9-iv (catálogo §4.7 + `↑/↓` + E2E G9). Rama `feat/pedidos-fase9-hardening`. Siguiente: Fase 10 (retiro legacy), **bloqueada por soak period**.

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
