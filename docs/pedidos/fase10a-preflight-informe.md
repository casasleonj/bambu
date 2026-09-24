# F10a-preflight — Informe de gates F10-1..F10-8 (Pedido Hub V2)

**Fecha:** 2026-09-23 · **Base:** `main` @ `46fa027` · **Rama:** `claude/soak-status-67xd9k`
**Gates:** `docs/pedidos/fase-composicion-c4-edit-plan.md` §"Gates verificables para Fase 10"
**Secuencia aprobada:** F10a-preflight → Preview con Hub ON → gates técnicos → rollback probado → Production Hub ON → soak real → gates finales → F10b.

> Regla de este informe: "según el doc" no cuenta como evidencia. Cada gate cita test/run/commit re-ejecutado en esta sesión contra código de `main`.

---

## 0. Resumen

> **Clasificación (corrección del equipo, 2026-09-23):** F10-1..F10-8 se definieron como gates para **retirar** `pedido-form-unified` (F10b). No todos bloquean una **activación controlada y reversible** (F10a). Cada gate se evalúa con dos estados:
> - **F10a:** ¿hay evidencia suficiente para activar el Hub en Production de forma controlada, con el legacy intacto como rollback?
> - **F10b:** ¿el gate está satisfecho bajo el criterio estricto original de retiro del legacy?
>
> Al terminar el soak se re-evalúa F10-1..F10-8 bajo el criterio F10b: no alcanza con "no vimos problemas", hace falta evidencia de que se puede retirar el legacy sin perder comportamiento, cobertura, auditoría ni capacidad de recuperación.

| Gate | Estado F10a (activación / soak) | Estado F10b (retiro legacy) | Pendiente |
|---|---|---|---|
| **F10-1** flag ON en un deploy | ✅ suficiente una vez hecha la activación de Production | ⏳ solo tras el deploy real + su observación en el soak | la activación misma (post-merge) |
| **F10-2** cobertura funcional por el workspace | ✅ suficiente para los 3 flujos alcanzables hoy | 🟡 **no completo**: el contrato exige 5 flujos. 2 **no ejercitables bajo la configuración vigente** (`NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR` OFF) | los 2 flujos condicionados siguen dentro del gate |
| **F10-3** integridad preview↔commit | ✅ | ✅ | — |
| **F10-4** permisos | ✅ | ✅ | — |
| **F10-5** auditoría | ✅ paridad Hub↔legacy: la activación no introduce regresión de auditoría | 🟡 **BRECHA PLAN↔CÓDIGO preexistente**: el gate exige `PedidoAuditDiff` con antes/después y ese artefacto no existe | resolver antes de declarar F10-5 satisfecho para F10b. No se construye dentro de F10a |
| **F10-6** sin regresión con flag ON | ✅ **APTO con mitigación**: 0 regresiones atribuibles al Hub fuera de `/pedidos`, Hub verificado en desktop y móvil | 🟡 **PENDIENTE**: no hay "suite E2E completa verde con flag ON ≥ N runs"; hay cobertura E2E del Hub faltante (inventario §F10-6) | inventario de cobertura → decidir migración/reemplazo antes de F10b · 4 tests móviles a corregir (`peek-mobile`) |
| **F10-7** VENTA_LIBRE / repartidor | ✅ **cerrado**: decisión existente recuperada | 🟡 retirar los consumidores legacy restantes + extraer dependencias runtime del workspace | §F10-7 |
| **F10-8** rollback probado | 🟡 mecánica ON→OFF en Preview ✅ + persistencia local ✅ · **falta el smoke autenticado read-only en Preview** | 🟡 ídem + observación durante el soak | smoke read-only (§F10-8) + eliminar la variable temporal de Preview |

> **Hallazgo fuera de alcance:** bug preexistente **B-1**. `/pedidos?atrasados=true` y `?enRiesgo=true` (links "Verlos" y "Ver y asignar" del dashboard) se quedan en skeleton **con y sin el Hub**. Muy probablemente afecta hoy a producción. Ticket [#273](https://github.com/casasleonj/bambu/issues/273), ver §F10-6.


---

## F10-1 — Flag ON por defecto en un deploy

- **Estado F10a:** ✅ suficiente una vez se haga la activación de Production. **Estado F10b:** ⏳ verde solo tras el deploy real y su observación.
- **Evidencia:**
  - Production (Vercel `bambu_demo_multimodelo`): `NEXT_PUBLIC_PEDIDOS_V2` **no existe** entre las variables del proyecto → prod corre con el Hub OFF. Los 6 usuarios nunca operaron el Hub.
  - Preview con Hub ON construido y servido: `dpl_6ehV8ENYw6rEMpBYbUAPaVDHYMdL` (rama `claude/soak-status-67xd9k`, variable Preview acotada a esa rama).
  - C4 (#229) mergeado: `74e9fe3`.
- **Bloqueo restante:** es la activación misma (merge de F10a → variable en Production → redeploy → smoke). No se hizo, según lo acordado.

## F10-2 — Cobertura funcional por el workspace

| Flujo | Activo en prod hoy | E2E con flag ON | Evidencia |
|---|---|---|---|
| Crear `PEDIDO` | sí | ✅ | `e2e/pedidos-hub.spec.ts` "workspace (Composición C1)" (existente, 37/37 del soak CI) |
| Crear `VENTA_RAPIDA` | sí | ✅ **nuevo** | `pedidos-hub.spec.ts` "workspace (F10-2): venta rápida…" — verifica `origen=VENTA_RAPIDA`, `clienteId=CONSUMIDOR_FINAL` en la respuesta real del POST |
| Editar `PEDIDO` | sí | ✅ **nuevo** | `pedidos-hub.spec.ts` "workspace (F10-2 / C4): editar un PEDIDO…" — `?openPedido` → Editar → workspace modo edición → PUT 200 → `cantPedido` 3→4 persistido |
| Editar `VENTA_RAPIDA` | **no ejercitable bajo la configuración vigente** | ⛔ sin evidencia (sigue en el gate) | Sin `NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR` una venta rápida nace `ENTREGADO` (`CrearPedidoUseCase.ts:247`) y el detalle solo ofrece "Editar" en `PENDIENTE`. La variable no existe en Vercel |
| Venta rápida entregar-después | **no ejercitable bajo la configuración vigente** | ⛔ sin evidencia (sigue en el gate) | Mismo flag, OFF en prod. Si se enciende, F10-2 exige E2E de ambos flujos por el workspace antes de F10b |

- **Estado F10a:** ✅ suficiente para los 3 flujos alcanzables hoy. **Estado F10b:** 🟡 no completo — el contrato original exige los 5; los 2 condicionados no desaparecen del gate.
- **Corrida:** local contra build de producción standalone con Hub ON: `10 passed` en frío, sin retries (`pedidos-hub.spec.ts`, chromium). CI del PR lo re-ejecuta en `e2e-hub`.
- **Soak CI (contexto, no sustituto):** 37 corridas programadas verdes consecutivas (2026-09-14 19:52Z → 2026-09-22 21:29Z). 0 flaky en las 3 muestreadas. Las 2 fallas del 14-sep eran del test (domingo), fix `dc3d649`.
- **Hallazgo:** con el Hub ON, `/pedidos` **todavía monta el form legacy** en 3 casos: (a) edición de pedidos `VENTA_LIBRE`/`RECURRENTE`, (b) creación con `pedidoInicial` precargado — el deep-link `?new=1&clienteId=` desde `/clientes`, (c) el fallback. Siguen funcionando igual que hoy. Son consumidores vivos a resolver en F10b.

## F10-3 — Integridad preview↔commit

- **Estado F10a:** ✅ · **Estado F10b:** ✅
- **Evidencia re-ejecutada:** `src/lib/__tests__/integration/preview-pedido-integridad.test.ts` contra Postgres real → **4/4**: (a) preview read-only con snapshots; (b) preview == pedido creado, campo a campo; (c) modo edición: `deepSnapshot` idéntico antes/después del preview y preview == pedido tras el PUT, con los `Pago` conservados exactos; (d) F1 crédito: preview y commit bloquean igual.
- **Por qué prueba al Hub y no solo al use case:** el workspace llama `POST /api/pedidos/preview` (`use-preview.ts:68`) y entrega su commit al mismo `handlePedidoSubmit` (`pedidos-client/index.tsx:941`) → `POST /api/pedidos` / `PUT /api/pedidos/[id]`. Las rutas delegan en `crearPedidoUseCase` / `actualizarPedidoUseCase` / `previewPedidoUseCase` de `src/modules/pedidos/application/index.ts`, construidos con las mismas dependencias que usa el test.

## F10-4 — Permisos

- **Estado F10a:** ✅ · **Estado F10b:** ✅
- **Cobertura previa:** solo guardrails **estáticos** (regex sobre el fuente) para `PUT /api/pedidos/[id]` y `POST /api/pedidos/preview`. `POST /api/pedidos` no tenía ninguno.
- **Test agregado:** `src/app/api/pedidos/__tests__/workspace-endpoints-roles.test.ts` — **15/15**, comportamental: ejecuta los 3 handlers con el `requireRole` real. REPARTIDOR/CONTADOR → 403 sin llegar al use case, ADMIN/ASISTENTE superan el gate, sin sesión → 401.
- **Mutation check:** ampliando los roles de `preview/route.ts` a los 4, el test falla (2 casos rojos). Archivo restaurado.
- **Página:** REPARTIDOR no tiene `view:pedidos` (`src/lib/permissions.ts:88`) → el proxy lo redirige. CONTADOR entra a `/pedidos` (`e2e/roles-permisos.spec.ts:298`).
- **Observación (paridad, sin cambio):** ni el FAB legacy ni el Hub ocultan "Nueva operación" a CONTADOR. El backend rechaza con 403 en ambos, así que no es regresión del Hub. El blueprint §CONTADOR pide "sin crear/corregir" en UI: queda como mejora de UX, no como gate.

## F10-5 — Auditoría

- **Estado F10a:** ✅ paridad Hub↔legacy — la activación no introduce regresión de auditoría.
- **Estado F10b:** 🟡 **BRECHA PLAN↔CÓDIGO preexistente / no bloqueante F10a / pendiente antes de declarar F10-5 satisfecho para F10b.** No se construye un sistema nuevo de auditoría dentro de F10a.
- **Test agregado:** `src/lib/__tests__/integration/pedido-edit-audit-paridad.test.ts` (Postgres real, handler real de `PUT`). La misma edición con el payload legacy y con el del workspace produce **1 fila de `Historial` por edición**, idénticas salvo `numero`, y el mismo efecto persistido (items 4→6, total, saldo, obs).
- **Por qué hay paridad por construcción:** ambas UIs pasan por `handlePedidoSubmit`, que en edición envía solo `{items, obs, actualizarCliente, direccionEntrega, barrioEntrega}`. La auditoría la escribe `ActualizarPedidoUseCase` dentro de la transacción (F3).
- **BRECHA registrada (no se corrige en F10a):** el `PedidoAuditDiff` "antes/después" que nombra el gate **no existe**. La fila del PUT es `datos: {numero, estado}`, sin diff. El único registro con antes/después es `PedidoCantidadAjuste` (G11, `ajustar-cantidad`). Afecta igual a legacy y Hub.

## F10-6 — Sin regresión con el flag ON

- **Método:** nuevo input `pedidos_v2` en `workflow_dispatch` (`ci.yml`, sin efecto en push/PR/schedule) para correr la **matriz `e2e` completa (8 shards) con el Hub ON**. Corrida: run `35798488906` (commit `1de3d05` = `main` `46fa027` + solo `ci.yml`). Baseline: run `35797682006` de `main` @ `46fa027` (flag OFF). Comparación test por test (spec + título), no por conteo.

**Shards que terminaron en CI (1, 2, 4, 5, 6, 8)** — fallidos/flaky/"did not run":

| Shard | Baseline `main` (OFF) | Hub ON | Nuevos con ON |
|---|---|---|---|
| 1 | 12 / 0 / 14 | 13 / 0 / 14 | `abonos` ×1 |
| 2 | 23 / 2 / 17 | 25 / 3 / 17 | `full-user-day` 6 y 7 · flaky `facturas` |
| 4 | 9 / 1 / 5 | 11 / 1 / 5 | `abonos` (mobile) · `session-expiry` |
| 5 | 14 / 0 / 24 | 14 / 0 / 24 | — |
| 6 | 26 / 0 / 22 | 28 / 3 / 22 | `full-user-day` 6 y 7 (mobile) · 3 flaky |
| 8 | 9 / 2 / 5 | 10 / 1 / 5 | `session-expiry` (mobile: flaky en baseline → falla) |

"Did not run" es idéntico en los 6 shards, así que los fallos nuevos no ocultan otros por cascada.

**Clasificación de cada fallo nuevo (error real leído del log):**

| Test | Causa | Clase |
|---|---|---|
| `full-user-day` 6 "Crear pedido con pago" | busca `locator('form')…input[placeholder*="Buscar"]`. El workspace no es un `<form>` por diseño (G1) | selector de UI legacy |
| `full-user-day` 7 "Filtrar pedidos por estado" | busca el botón de filtro "PENDIENTE" de las tabs legacy | selector de UI legacy |
| `abonos` "register abono and cancel abono" | crea el pedido previo por `getByTestId('submit-pedido')` (form legacy) | selector de UI legacy |
| `session-expiry` "auth:expired event redirects" | espera el texto "Lista de Pedidos" del header legacy | selector de UI legacy |
| flaky `embarques-fixes`, `embarques-mission-detail`, `fiado-status-ui` | `strict mode violation: resolved to 2 elements` → copia transitoria de SSR con streaming (documentada en `fixtures.ts → appMain`). La misma firma aparece 22 veces en los logs del baseline; `fiado-status-ui` ya es flaky en `main` | ruido de infra pre-existente |
| flaky `facturas › page loads` | heading no visible en 5 s, pasa en el reintento. `/facturas` no lee el flag (solo `pedidos/loading.tsx` y `pedidos-client` llaman `pedidosV2Enabled`) | timing |

**Shards 3 y 7: cancelados** por el `timeout-minutes: 60` del job (23:40 → 00:40Z) sin resumen. `--list` con el flag ON muestra que concentran las suites de UI legacy de `/pedidos` (`pedidos-all-contexts` 54, `pedidos` 16, `pedidos-filtros-funcionales` 12, +10 archivos `pedidos-*` menores), cuyos tests con el Hub ON agotan su timeout ×3 intentos. Para no dejar sin evidencia el resto de esos shards, los corrí **en local contra el build Hub ON**:

| Subconjunto (shards 3/7) | Resultado | vs baseline CI |
|---|---|---|
| no-`/pedidos` en chromium (16 archivos, 119 tests) | 99 ✅ · 5 ❌ · 4 flaky | los 5 ❌ y los 4 flaky **ya fallan en el baseline** (`nomina` "crear nomina…", 3× `productos-comprehensive`, `opt-in-toast`), salvo 1: `precios-especiales` "Venta Rápida PUNTO", que abre la venta rápida por el FAB/form legacy |
| no-`/pedidos` en chromium-mobile (mismos 16 archivos) | 72 ✅ · 5 ❌ · 34 "did not run" | los 5 ❌ **ya fallan en el baseline** (`nomina`, `produccion` "carga inicial…", 3× `productos-comprehensive`). Los "did not run" son la cascada del describe serial de `produccion` tras su primer fallo, igual que en `main` |
| specs del Hub en **chromium-mobile** (nunca corridos con el flag ON: `e2e-hub` solo corre desktop) | 24 ✅ · 6 ❌ en la primera corrida → en frío los 2 E2E nuevos de F10-2 pasan (el fallo era el rate limit local de 300 req/min) · quedan **4 ❌ con una sola causa**: los tests esperan `peek-desktop` y en móvil el componente es `peek-mobile` (`peek-panel.tsx:69`) | supuesto de desktop en el test |

- **Precios especiales con el Hub ON:** verificado directo. Preview (lo que muestra el workspace) y commit aplican el precio especial igual: PUNTO 2000 / DOMICILIO 2500, `precioOrigen: cliente`.
- **Peek y G11 en móvil (viewport iPhone 13):** peek abre sin navegar, muestra el pedido y la acción destacada, cierra con ✕. "Cambiar cantidades" → 2 opciones, sin venta libre → el form de corrección exige motivo. Todo funciona.
- **Observación UX (pre-existente, no del Hub):** en iOS el banner PWA "Instalar aplicación" (fijo abajo, `z-40`) tapa la parte inferior de la hoja del peek móvil, donde está "Cambiar cantidades…", hasta que el usuario lo cierra. Conviene verlo en el soak.

**Estado F10-6:**
- **F10a — ✅ APTO con mitigación.** 0 regresiones atribuibles al Hub fuera de `/pedidos` (8 shards: 6 en CI + subconjunto no-`/pedidos` de 3/7 en local, desktop y móvil). La suite propia del Hub pasa en desktop y en móvil, salvo 4 tests con una aserción solo-desktop cuyo comportamiento se verificó a mano.
- **F10b — 🟡 PENDIENTE.** El contrato pide "suite E2E completa verde con flag ON ≥ N runs" y hoy hay cobertura E2E del Hub faltante (inventario abajo). Durante el soak se junta evidencia operativa; antes de F10b se decide qué pruebas se migran o reemplazan.

### Inventario de cobertura: tests legacy de `/pedidos` con el Hub ON

Método: los 90 tests de los 9 specs de UI de `/pedidos` corridos en local contra el build Hub ON, sin retries. Los que quedaron en "did not run" por cascada serial se re-corrieron aislados hasta que no quedó ninguno sin resultado. Clasificación con el baseline de `main` (flag OFF).

| Resultado con Hub ON | Tests | Qué significa |
|---|---|---|
| **Pasan** (UI-agnósticos o todavía válidos) | **26** | API: filtros backend ×4, venta rápida / envío / pagar fiado / anular vía API, pedido sin pago es PENDIENTE, detalle incluye factura. UI: accesos por rol, búsqueda, `SmartDateFilter`, badges de origen y entrega, clic en fila abre detalle, deep-link con `clienteId`, touch targets, filtro default "Turno", pedido creado aparece en lista, filtrar por estado y por origen, ver detalle, repartidor ve Mi Ruta |
| **Skip condicional** del propio test | 2 | venta rápida con sobrepago, asignar a embarque (`test.skip` por precondición) |
| **Fallan también en `main`** (preexistentes, no del Hub) | 5 | campo `tipo` ausente en el listado de API (`tipo=ENVIO`, `tipo=PUNTO`, `tipo=ENVIO` en DOMICILIO) · `?atrasados=true` y `?enRiesgo=true` (ver bug B-1 abajo) |
| **Fallan solo con el Hub ON** (atados a la UI legacy) | **57** | → cobertura a migrar o reemplazar, agrupada abajo |

**Cobertura faltante en el Hub, por comportamiento.** C-1..C-8 suman los 57 tests; C-9 y C-10 son specs externos y E2E propios del Hub:

| # | Comportamiento que cubrían los tests legacy | Tests | Dónde vive en el Hub | Cobertura E2E Hub hoy | Acción antes de F10b |
|---|---|---|---|---|---|
| C-1 | **Fiados:** lista, filtros, chips de periodo, empty state, expandir por cliente, **formulario de pago y métodos de pago**, filtro de días, badge de límite, búsqueda, dataset independiente de los filtros de Pedidos, hint "solo fiados de hoy", limpiar filtros, tablas desktop/mobile | 17 | foco "Esperando pago" + acción "Ver cartera" → `/cartera` | 🟡 solo el filtro por foco. **Ningún E2E navega a `/cartera`**: el registro de pago de fiado por UI queda **sin E2E** | E2E del flujo Hub → `/cartera` → registrar pago |
| C-2 | **Alertas:** lista agregada del detector, reglas activas, filtros por severidad, empty state, escenario "2 pedidos mismo día", expandir por cliente, botones Guía / Crear caso, colores de severidad, búsqueda, tablas desktop/mobile | 13 | riesgo en el peek (`pedidos-peek-riesgo`) + foco Excepciones + `/casos` | 🟡 solo el caso por pedido en el peek. **No hay E2E de la vista agregada de alertas del detector** con el Hub | decidir si el Hub necesita vista agregada o si `/casos` la reemplaza, y cubrirla |
| C-3 | **Shell y navegación:** 3 tabs, navegación y URL `?tab=`, badges de conteo, stats cards, layout desktop/mobile | 11 | focos (G2) + `pedido-hub-desktop/mobile` | ✅ parcial: shell, focos, responsive (`pedidos-hub.spec`) | nada de tabs; confirmar que conteos y stats de los focos tengan E2E |
| C-4 | **Filtros UI:** panel de filtros, "Limpiar todo" (×2, incluida la regresión de race de URL), URL con filtros combinados persiste, filtros por tab | 4 | focos + rango de fecha independiente | 🟡 1 test (foco + fecha). **Sin E2E de búsqueda, limpiar ni persistencia de URL en el Hub** | E2E equivalentes en el Hub |
| C-5 | **Detalle / estado visual:** stepper de estado, acciones según `PENDIENTE`, **nombre del cliente en el detalle**, **nombre de negocio prominente en lista y detalle**, **estado de pago visual (sin ✓ si no pagó; fiado en rojo si entregado con saldo)** | 6 | peek (capa 1/2) | 🟡 peek abre, navega y muestra acción destacada. **Sin E2E de nombre de negocio, estado de pago visual ni saldo en el Hub** | E2E del peek para negocio, estado de pago y saldo |
| C-6 | **Edición que sobrevive a un refetch realtime** (cantidad, precio y dirección persisten tras `pedido.updated`) | 1 | workspace modo edición | 🟡 edición cubierta (F10-2), **sin el caso de refetch realtime** | E2E de edición + evento realtime |
| C-7 | **Crear por UI:** venta rápida vía form legacy; crear fiado vía UI (`pedidos-all-contexts`) | 2 | workspace | ✅ venta rápida (F10-2) · 🟡 pedido con cliente sin pago: C1 lo crea, pero no verifica que aparezca como fiado | extender C1/C-1 |
| C-8 | **Contexto por rol:** ADMIN/ASISTENTE ven tabs y filtros | 3 | Hub (roles) | 🟡 permisos por API (F10-4); sin E2E de UI por rol en el Hub | E2E de UI del Hub por rol (ASISTENTE, CONTADOR) |
| C-9 | **Specs externos que crean o leen pedidos por la UI legacy:** `abonos` (crea el pedido por `submit-pedido`), `full-user-day` 6 y 7 (form y filtro "PENDIENTE"), `session-expiry` (espera "Lista de Pedidos"), `precios-especiales` (venta rápida por FAB legacy) | 5 (×2 proyectos) | — | los comportamientos de fondo (abono, expiración de sesión, precio especial) no dependen del Hub; precio especial verificado por API | cambiar su preparación a API o al workspace |
| C-10 | **E2E del Hub en móvil** que esperan `peek-desktop` (peek en `pedidos-hub`, 2 en `pedidos-peek-riesgo`, decisión G11 en `pedidos-g11`) | 4 | `peek-mobile` | ✅ comportamiento verificado a mano (iPhone 13) | **corregirlos para probar `peek-mobile`**; la verificación manual no sustituye la automatización |

### Bug preexistente encontrado (fuera del alcance de F10a)

- **B-1 — `/pedidos?atrasados=true` y `?enRiesgo=true` se quedan en skeleton.** Son los destinos de los links "Verlos" y "Ver y asignar" del banner del dashboard. Reproducido en local contra el build de `main` **con el flag OFF y con el flag ON**: el API responde 200 (`GET /api/pedidos?all=true&atrasados=true`), no queda ningún request colgado ni hay error de página, pero la vista no pasa del skeleton ni muestra su banner ("Mostrando solo pedidos pendientes sin asignar…"). El test `pedidos.spec.ts` "?atrasados=true abre vista autocontenida" ya falla en el baseline de CI de `main`. **No es regresión del Hub** y muy probablemente afecta hoy a producción. Ticket [#273](https://github.com/casasleonj/bambu/issues/273); no se toca en F10a.

- **Otros jobs de la misma corrida:** Type check + Tests ✅ · Lint ✅ · E2E Hub (V2 ON) ✅ · Integration (non-blocking) ❌ 1/55: `pedido-dedup.test.ts` (P2028), que también falla en el baseline de `main` (documentado en #258).
- **Local:** `npx tsc --noEmit` limpio · `npm run test` 343 archivos / **3395 tests** verdes · eslint limpio en archivos tocados.

## F10-7 — VENTA_LIBRE / repartidor

Regla de recuperación aplicada: blueprint §2.5/§8.3/§8.4, `VENTA_LIBRE_EXPERIENCIA_HUB_v1.0.md` §0/§0bis/§3bis/§16, `VENTA_LIBRE_AUDITORIA_CONTRATO_CODIGO_v1.0.md` §4, código actual.

**DECIDIDO (no reabrir):**
- VENTA_LIBRE = venta no respaldada por Pedido, **dentro de un Embarque**. Se registra solo (A) por el repartidor asignado en ruta o (B) por Admin/Asistente dentro de la conciliación de ese Embarque. Mecanismo `Pedido.origen = VENTA_LIBRE`, integrado con pedido/entrega/pago/caja/auditoría (no es una categoría aislada).
- **El Pedido Hub NO crea VENTA_LIBRE** (`mostrar ≠ crear`). "Venta durante la ruta →" solo navega a Embarques (`hub-accion-frontera.test.ts`).
- PEDIDO / VENTA_RAPIDA / VENTA_LIBRE **no se colapsan en un formulario**. El workspace cubre solo PEDIDO/VENTA_RAPIDA.
- **Superficie UX del repartidor:** se queda en `/repartidor` (dominio Embarques). La consolidación de `/repartidor` en el Hub está **PENDIENTE de validación, no aprobada** (§8.3) → no hay decisión abierta que tomar para activar el Hub.

**ESTADO TÉCNICO ACTUAL:**
- El repartidor **nunca usó `pedido-form-unified`**. Tiene su propio modal en `src/app/(app)/repartidor/repartidor-client.tsx` (`POST /api/pedidos/venta-libre`, offline vía `requestQueue`). **La premisa de F10-7 ("el modal de repartidor usa pedido-form-unified") es incorrecta.**
- `pedido-form-unified` sigue vivo en `/pedidos` para: editar VENTA_LIBRE/RECURRENTE, crear con `pedidoInicial` (deep-link `/clientes`), fallback, y todo con el flag OFF.
- **Acoplamiento/deuda técnica (no se toca en F10a):** `pedido-workspace` depende de `pedido-form-unified` **en runtime, no solo en tipos**: `PedidoPricingSummary`, `PedidoItemEditor`, `PedidoContextPanel`, `resolveActualizarCliente` y los tipos `PedidoUnifiedData`, `Cliente`, `Tier`, `PatronConsumo`. Borrar el directorio rompería el Hub. Extraerlos sin cambiar semántica es preparación de F10b.

**BRECHA PLAN↔CÓDIGO (para F10b, no bloquea activación):**
- Qué superficie **edita un VENTA_LIBRE o RECURRENTE existente** cuando se retire el form legacy. Las fuentes lo marcan como EVIDENCIA HISTÓRICA A RECUPERAR (EH-5: corregir una VL ya entregada preservando número/factura). Con el Hub ON el comportamiento es idéntico al actual.
- Brechas VL ya documentadas y sin cambios: BRECHA-4 (RD-1), BRECHA-6 (RD-2), BRECHA-8. Independientes de la activación.

- **Estado F10a:** ✅ **cerrado.** Decisión existente recuperada: el Hub no crea VENTA_LIBRE; VENTA_LIBRE pertenece operacionalmente a Embarques; el repartidor trabaja en `/repartidor`; `/repartidor` no depende de `pedido-form-unified`. **No es decisión de negocio abierta para activar el Hub.**
- **Estado F10b:** 🟡 cuestión distinta, de retiro: (1) retirar los consumidores legacy restantes — edición de VENTA_LIBRE/RECURRENTE, deep-link `?new=1&clienteId=` desde Clientes, fallback, `cliente-detail-cache.ts:154`; (2) extraer sin cambiar semántica las dependencias runtime que `pedido-workspace` importa de `pedido-form-unified`. Nada de esto se toca en F10a.

## F10-8 — Rollback probado

**Hallazgo previo:** existe **un solo proyecto Supabase** (`wdttkrlbpcawulaaiapj`, sin branches de datos) → los deploys de **Preview usan la base de producción**. Cualquier "gate técnico en Preview" que cree o edite datos escribe en producción, así que la verificación en Preview debe ser **read-only**.

| Paso | Dónde | Resultado | Tiempo |
|---|---|---|---|
| Variable `NEXT_PUBLIC_PEDIDOS_V2=true` (Preview, solo rama `claude/soak-status-67xd9k`) | Vercel | creada `lvEjriBusynzbpE7` | segundos |
| Redeploy Hub ON | Vercel | `dpl_6ehV8ENYw6rEMpBYbUAPaVDHYMdL` READY | **~118 s** |
| Verificación | Vercel | sirve (`/pedidos` → `/login`, 200). Sin sesión real no se ve `/pedidos` | — |
| Flag → `false` | Vercel | editada | segundos |
| Redeploy Hub OFF | Vercel | `dpl_4rg1es9VXZrKiMvm363ses37qccj` READY | **~124 s** |
| Build Hub ON + arranque | local (standalone, Postgres real) | `/pedidos` = Hub (`pedido-hub` visible, sin `tab-hoy`); pedido marcador creado (201) | build 87 s |
| Build Hub OFF + arranque | local | `/pedidos` = legacy (`tab-hoy` visible, sin `pedido-hub`); **el pedido creado con Hub ON sigue visible** → sin pérdida de datos | build 90 s |

- **Procedimiento de rollback en Production:** Vercel → `NEXT_PUBLIC_PEDIDOS_V2` = `false` (o borrar) en Production → Redeploy del último deploy de producción (sin caché) → smoke. **Tiempo esperado ≈ 2–3 min** (build medido ~2 min). Cambiar solo la variable **no** alcanza: `NEXT_PUBLIC_*` se inlinea en el build.
- **Datos:** Hub y legacy escriben por los mismos endpoints y use cases (F10-3/F10-5) → el rollback no requiere migración. La cola offline (`requestQueue`) reproduce contra las mismas URLs, así que es compatible en ambos sentidos.
- **Estado F10a:** 🟡 hasta completar el smoke autenticado read-only en Preview. **Estado F10b:** 🟡 ídem + la observación durante el soak.
- **Smoke autenticado read-only — PENDIENTE (requiere credencial real):** no tengo credenciales de producción y no las pruebo, porque Preview apunta a la BD real. Los deploys de Vercel son **inmutables**, así que el smoke puede hacerse sobre los dos deploys ya generados por la prueba de rollback, sin volver a tocar variables:
  1. `https://bambudemomultimodelo-7v43tc6wb-casasleonjs-projects.vercel.app` (**Hub ON**, `dpl_6ehV8ENYw6rEMpBYbUAPaVDHYMdL`) → login → `/pedidos` → confirmar Hub: focos arriba, sin tabs "Pedidos/Fiados/Alertas" → navegar y abrir un peek (solo lectura).
  2. `https://bambudemomultimodelo-5rd7agn7d-casasleonjs-projects.vercel.app` (**Hub OFF**, rollback, `dpl_4rg1es9VXZrKiMvm363ses37qccj`) → login (la cookie es por host) → `/pedidos` → confirmar legacy: tabs visibles.
  3. **Prohibido durante el smoke:** crear, editar, entregar, pagar, anular, conciliar o cualquier otra escritura.
- **Limpieza — PENDIENTE:** eliminar la variable Preview `NEXT_PUBLIC_PEDIDOS_V2` acotada a `claude/soak-status-67xd9k` (id `lvEjriBusynzbpE7`, hoy `false` = inerte). La API disponible en esta sesión permite crear y editar variables pero **no borrarlas**, así que hay que hacerlo desde el dashboard: *Settings → Environment Variables*. No debe quedar configuración experimental abandonada.

---

## Observaciones a vigilar durante el soak

| # | Observación | Tipo | Bloquea F10a | Acción |
|---|---|---|---|---|
| O-1 | En iOS el banner PWA "Instalar aplicación" (`role=banner`, fijo abajo, `z-40`) **cubre la parte inferior de la hoja `peek-mobile`**, donde está "Cambiar cantidades…", hasta que el usuario lo cierra. Visto al probar G11 en viewport iPhone 13 | UX, preexistente (el banner ya existía; el peek móvil es nuevo) | No: el banner se puede cerrar | preguntar explícitamente en el feedback semanal · registrar incidencias · decidir antes de F10b si el peek debe reservar ese espacio |
| O-2 | Ni el FAB legacy ni el Hub ocultan "Nueva operación" a CONTADOR (el backend responde 403) | UX, paridad | No | registrar si CONTADOR lo intenta durante el soak |
| O-3 | Los 4 E2E móviles del Hub que esperan `peek-desktop` fallan en chromium-mobile | deuda de tests | No (comportamiento verificado a mano) | corregirlos para probar `peek-mobile` antes de F10b; la verificación manual no sustituye la automatización |

## Soak de producción — criterio aprobado (híbrido)

**Datos reales** (producción, solo lectura, agregados, últimos 28 días):

| Métrica | 28 días |
|---|---|
| Pedidos creados | 168 (18 días con operación ≈ 9/día; sin domingos) |
| VENTA_RAPIDA / PEDIDO | 148 / 20 |
| VENTA_LIBRE / RECURRENTE | 0 / 0 |
| Nueva demanda G11 (`pedidoOrigenId`) | 0 |
| Obligaciones N2 creadas | 0 |
| Ediciones de pedido (`Historial` UPDATE) | 30 |
| Pagos | 105 |
| `CierreDia` registrados | 0 |
| Plantillas recurrentes activas | 1 (`cadaNDias=7`) |

**Criterio (aprobado 2026-09-23). El soak cierra cuando se cumplen todas:**
- mínimo **2 semanas operativas completas** (lun–sáb), con ≥2 lunes y ≥1 ciclo de la plantilla recurrente;
- **≥10 PEDIDO**, **≥60 VENTA_RAPIDA**, **≥10 ediciones**, **pagos ejercitados**, medidos con consultas read-only sobre `Pedido`, `Historial` y `Pago` en la ventana;
- **sesión guiada** para los flujos con volumen orgánico cero (G11 nueva demanda, G11 corrección de cantidad, N2 gestión de pendiente, generación de habituales).

**Reglas del soak:**
- **No se fabrican datos en producción** para cumplir una casilla. G11, N2, habituales y corrección se ejercitan **solo sobre casos operativos legítimos** o en un **entorno de prueba seguro**. Hoy Preview no lo es porque comparte la BD de producción.
- Un flujo que no ocurra naturalmente en las 2 semanas se registra como **"no observado en producción"**, nunca como aprobado.
- **Evidencia temporal** (las métricas del plan §2.3 no existen): consultas read-only + Sentry + feedback e incidencias de los 6 usuarios. No se construye una plataforma de observabilidad dentro de F10a.
- **Rollback inmediato** ante regresión crítica (pérdida o duplicación de pedido/pago, precio o saldo incorrecto, bloqueo de creación), con el procedimiento F10-8.
- El **legacy permanece intacto** durante todo el soak: no se borra `pedido-form-unified`, no se elimina el flag, no se refactorizan sus consumidores.

## Secuencia siguiente

1. PR de F10a (este cambio) → revisión → merge.
2. Smoke autenticado read-only en Preview (§F10-8) + eliminar la variable temporal de Preview.
3. `NEXT_PUBLIC_PEDIDOS_V2=true` en **Production** → redeploy → **smoke inmediato** de los flujos críticos.
4. Si el smoke es correcto, **empieza oficialmente el soak**.
5. Al terminar el soak: re-evaluar F10-1..F10-8 bajo el criterio F10b + segunda revisión de `main` ("el legacy ya no tiene consumidores necesarios"). Solo entonces se abre F10b.

## Cambios de esta fase (PR F10a-preflight)

- `.github/workflows/ci.yml`: input `pedidos_v2` en `workflow_dispatch` (default `false`; push/PR/schedule sin cambios).
- `src/app/api/pedidos/__tests__/workspace-endpoints-roles.test.ts` (F10-4, nuevo).
- `src/lib/__tests__/integration/pedido-edit-audit-paridad.test.ts` (F10-5, nuevo).
- `e2e/pedidos-hub.spec.ts`: 2 E2E nuevos gated por el flag (F10-2).
- `docs/AGUA_BAMBU_INTEGRIDAD_COMERCIAL_CONVERGENCIA_v1.0.md` §6: estado real del soak.
- Este informe.

Sin cambios de comportamiento, sin borrar legacy, sin tocar el flag en Production, sin mover tipos.

## Antes de F10b

Segunda revisión de `main` orientada a demostrar **"el legacy ya no tiene consumidores necesarios"**. Consumidores vivos conocidos hoy: edición VL/RECURRENTE, deep-link `?new=1&clienteId=`, `cliente-detail-cache.ts:154` (prefetch del form), acoplamiento runtime del workspace (§F10-7), specs E2E atados a UI legacy (§F10-6).
