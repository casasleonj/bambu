# Plan de ejecución — Frontend de Embarques completo

- **Estado:** ITERACIÓN 1 · RONDA 2 — pendiente de aprobación del PO (protocolo AGENTS.md)
- **Fecha:** 2026-08-27
- **Autoridad de producto:** `planembarquesuxequipodesarrollo(1).md`
- **Autoridad de dominio (congelada, no se toca):** `plan-maestro-embarques-autocontenido-equipo-desarrollo.md` + 23 ADRs + `GATE-APROBACION.md` (PASS)
- **Objetivo:** construir de verdad las 4 pantallas (Command Center · Preparation Flow · Mission Detail · Reconciliation) que el plan describe y que hoy solo existen como parches sobre la UI vieja.

---

## PARTE 1 — RONDA 1: hallazgos (qué es el código hoy)

### 1.1 Rutas y componentes reales

| Ruta | Server Component | Client | Líneas | Qué es hoy |
|---|---|---|---|---|
| `/embarques` | `page.tsx` (query directa, `take: 100`, solo hoy) | `embarques-client/index.tsx` | 608 | Lista plana con 2 tabs (Embarques / Estadísticas), filtros por fase derivada, banner stock estimado, modales crear/auto-generar/stock |
| `/embarques/[id]` | `[id]/page.tsx` | `[id]/embarque-client.tsx` | 1075 | Detalle con 3 tabs (Pedidos / Clientes / Físico), action bar, hint "siguiente paso", menú `hover:block`, modales asignar/editar |
| `/embarques/[id]/cerrar` | `cerrar/page.tsx` | `cerrar-client/index.tsx` | 1063 | Wizard de 5 secciones NO forzadas; `useMemo` local de cuadre + `POST /cerrar/preview` (dry-run) como número autoritativo con fallback local |

Helpers UI ya existentes y reutilizables:
- `src/lib/embarque-ui-estado.ts` — `derivarEstadoUI`, `derivarSiguientePaso`, `contarPorFase`, `estadoBackendParaFase`. **Base del Command Center y del Preparation Flow, ya testeada** (`embarque-ui-estado.test.ts`).
- `embarque-card.tsx` (90), `resumen-estados.tsx` (26), `embarque-duration-badge.tsx` (48).
- `ledger-client/` — `ledger-tab`, `movimiento-*`, `recovery-*`, `botellones-panel` (tab "Físico" del detalle, ya usa `fetchResilient`).
- `stats-*` (7 componentes) — tab Estadísticas, solo lectura.

### 1.2 Contrato de API real (autoridad = `route.ts`, per ADR-ARQUITECTURA-001)

| Acción | Endpoint | Rol | offline | Idempotencia | Notas |
|---|---|---|---|---|---|
| Listar | `GET /api/embarques` (`?desde&hasta&all&estado&stock`) | todos (REPARTIDOR filtrado por su `trabajadorId`) | — | — | Prisma directo, enrich anti-N+1, devuelve `capacidadInfo`/`totalPacas`/`pesoKg` calculados |
| Detalle | `GET /api/embarques/[id]?full=true` | todos | — | — | |
| Crear | `POST /api/embarques` | ADMIN, ASISTENTE | ✅ (`e1e51314`) | ✅ `offlineId` | `CrearEmbarqueUseCase` (thin controller) |
| Auto-generar | `POST /api/embarques/auto` (`?dryRun`) | ADMIN, ASISTENTE | ⚠️ verificar | ❌ | `computePreview` + `CrearEmbarqueUseCase` por asignación; `updateMany` fuera de tx |
| Editar / asignar pedidos | `PUT /api/embarques/[id]` | ADMIN, ASISTENTE | ✅ | ✅ `offlineId` + lock `EMBARQUE_CARGA` | lógica inline (por diseño, ADR-ARQUITECTURA-001) |
| Quitar pedido | `DELETE /api/embarques/[id]/pedidos/[pedidoId]` | ADMIN, ASISTENTE | ✅ (`75a40437`) | idempotente (status check) | |
| Enviar a ruta | `POST /api/embarques/[id]/enviar` | ADMIN, ASISTENTE | ✅ (`012e3857`) | ✅ `offlineId` | regla "no 2 EN_RUTA por trabajador" inline (ADR-ARQUITECTURA-001) |
| Cerrar | `POST /api/embarques/[id]/cerrar` | ADMIN, ASISTENTE + `requireOwnership` | ✅ (`b29d1f0d`) | ✅ `offlineId` + `CierreDedupService` | `CerrarEmbarqueUseCase` (thin real) |
| **Preview de cierre** | `POST /api/embarques/[id]/cerrar/preview` | ADMIN, ASISTENTE + `requireOwnership` | hereda | dry-run (rollback) | `CerrarEmbarqueUseCase({ dryRun: true })` (`eecb6d8d`) |
| Cancelar | `DELETE /api/embarques?id=` (**solo ADMIN**) · `DELETE /api/embarques/[id]` (**ADMIN+ASISTENTE**) | ⚠️ inconsistente | ✅ (`[id]`) | ✅ `offlineId` | dos endpoints, misma acción, roles distintos |
| Movimientos físicos | `GET/POST /api/embarques/[id]/movimientos` | ADMIN, ASISTENTE | ✅ | ✅ `offlineId` unique | sin `logAudit` |
| Recovery | `POST /api/embarques/[id]/recovery` | ADMIN, ASISTENTE | ✅ | ✅ `offlineId` + lock | `CrearRecoveryDecisionUseCase`, único con test de concurrencia real |
| Botellones | `POST /api/embarques/[id]/botellones` | ADMIN, ASISTENTE, **REPARTIDOR** | ✅ | ✅ `offlineId` | **falta `requireOwnership`** — REPARTIDOR puede tocar embarque ajeno (bug real A.3.6) |
| Optimizar orden (TSP) | `POST/GET /api/embarques/[id]/optimizar-orden` | ADMIN, ASISTENTE | ❌ | ❌ sin lock | `prisma.embarque.update` directo |
| Gastos | `POST/DELETE /api/embarques/[id]/gastos` | ADMIN, ASISTENTE | ❌ | ❌ | Zod duplicado, DELETE sin audit |
| Stats | `GET /api/embarques/stats` | todos | — | — | `src/lib/embarque-stats.ts` |

### 1.3 Reglas de negocio ya codificadas (NO reimplementar en frontend)

- `EmbarqueValidationService`: `MAX_UNIDADES=70` (config `MAX_UNIDADES_EMBARQUE`), tolerancia stock 50% con stock>0 / hard cap 30 sin stock, peso 110% de `capacidadKg`, `usaMoto=true`.
- `CierreEmbarqueService`: comisión repartidor 5%, tolerancia pagos 1%, discrepancia = `cargadas − entregadas − devueltas − cambios − rotas`, caja = `baseDinero + efectivoEsperado(solo EFECTIVO) − gastos`.
- `ledger-fisico.service.ts` (ADR-FISICO-001): `cantidad` siempre positiva, efecto por `tipo` (10 tipos), `AJUSTE_AUTORIZADO` exige `metadata.effect`+`authorization`+`userId`.
- `recovery.service.ts`: SOBRANTE exige `sourceEventId` con lock; FALTANTE no. `0 ≤ cantidadAplicada ≤ cantidad`.
- `botellones.service.ts` (ADR-BOTELLONES-001): recogida (`RETORNO`) y entrega (`ENTREGA`) siempre separadas.

### 1.4 Deuda transversal (evidencia B.8 + verificación propia 2026-08-27)

| # | Item | Estado real (verificado) |
|---|---|---|
| 1 | `02-api-contract.md` no existe | ✅ **Creado en PR-1** |
| 2 | `01-ux-contract.md` / `03-exception-model.md` en BORRADOR | ✅ **De-BORRADOR en PR-1** (aprobados 2026-08-27) |
| 3 | Cancelar: `DELETE ?id=` (ADMIN) vs `DELETE /[id]` (ADMIN+ASISTENTE) | ✅ **Unificado en PR-1** a ADMIN+ASISTENTE en ambos |
| 4 | `src/lib/embarque-capacidad.ts` duplica `PESOS_KG` 1:1 con `Carga.ts` del dominio | ✅ **PR-1**: re-exporta de `Carga.ts`. Los thresholds de `getCapacidadInfo` vs `CapacidadInfo.fromPeso` siguen paralelos (labels: `'Máximo'` vs `'Maximo'`); consolidar en Fase 3 cuando el Command Center consuma el VO |
| 5 | Zod fragmentado | ⚠️ `GastoEmbarqueSchema` ya era idéntico en ambos sitios; **PR-1** hace que el route importe de `validators.ts`. `MovimientoSchema`/`RecoverySchema`/`BotellonesSchema`/`EmbarqueAutoSchema` siguen locales (no duplicados) — mover en la fase que toque cada route |
| 6 | `botellones POST` sin `requireOwnership` | ✅ **Ya estaba arreglado** (`374d5503`, post-auditoría). Verificado: todos los sub-routes de escritura tienen `requireOwnership` |
| 7 | Menú de acciones del detalle `hidden group-hover:block` — poco confiable en touch | ❌ Pendiente → **Fase 5** (Mission Detail) |
| 8 | `optimizar-orden` sin lock ni offline; `gastos`/`auto` sin offline | ❌ Pendiente → **Fase 4/5** (offline) + **Fase 8** (lock) |
| 9 | `movimientos`/`botellones`/`gastos DELETE`/`DELETE embarques` sin `logAudit` | ❌ Pendiente → **Fase 8** |
| 10 | `capacidadKg` se recalcula desde `Trabajador` en cada lectura → altera históricos (existe `EmbarqueCarga.capacidadKg` snapshot sin usar) | ❌ Pendiente → ADR propio si se prioriza |
| 11 | `optimizar-orden GET` sin `requireOwnership` (su POST sí) | ❌ Pendiente → **Fase 8** |

### 1.5 Estado de tests (matriz A.10 / B.7)

| Punto | Estado | Acción en este plan |
|---|---|---|
| Doble confirmación / replay offline / recovery / botellones / cierre normal / mobile | ✅ Cubierto | mantener |
| Máquina de transiciones sin test dedicado | ⚠️ Parcial (mejorado por `f7cfc535`, confirmar cobertura) | Fase 8 |
| Concurrencia real solo en Recovery (asignar/enviar/cerrar = tests de "forma") | ⚠️ Parcial | Fase 8 |
| Timeout/offline solo verificación estática por regex | ⚠️ Parcial | Fase 8 |
| `POST /api/embarques/auto` sin test unitario | ⚠️ Parcial | Fase 8 |

---

## PARTE 2 — RONDA 2: plan de ejecución (requiere aprobación)

### 2.0 Principios (del plan, no reabrir)

1. **4 estados reales** (`ABIERTO→EN_RUTA→CERRADO|CANCELADO`). Toda granularidad extra se deriva en cliente (`embarque-ui-estado.ts`), nunca se persiste.
2. **No se toca el contrato de backend.** Cualquier necesidad que implique schema/lock/fuente de verdad nueva → flujo de ADR, no `if` en el front.
3. **Reutilizar, no reconstruir el dominio:** `Crear/Cancelar/Cerrar UseCase`, `EmbarqueAdapter`, `recovery/botellones/ledger-fisico.service`, `embarque-stats`, `cerrar/preview`.
4. Cada pantalla nueva: **desktop + mobile + 4 estados de red** (loading / success / offline / error). Textos duplicados responsive → `data-testid` por vista (AGENTS.md #24).
5. Mutaciones: `fetchResilient` + toasts `success`/`info`/`error`.

### 2.1 Decisiones propuestas (marcar OK o corregir)

| # | Decisión | Propuesta |
|---|---|---|
| D1 | ¿Command Center reemplaza `/embarques` in-place o ruta nueva? | **In-place**, detrás de flag `NEXT_PUBLIC_EMBARQUES_V2` (default `true` en dev, rollout controlado). 6 usuarios, sin necesidad de dos árboles largos. |
| D2 | ¿Se mantienen las 2 tabs (Embarques / Estadísticas)? | **Sí.** El Command Center es la tab "Embarques" rediseñada; Estadísticas queda igual. |
| D3 | Sustitución (Fase 6) | **DENTRO DE ALCANCE** (PO: "la necesito"). Se revierte la decisión de `01-ux-contract.md` §4. Additivo: `construirMovimientosSustitucion` + modelo `Sustitucion` ya existen; solo se cablean a un endpoint nuevo + ADR-SUSTITUCION-001. NO cambia schema/lock/fuente de verdad. Ver Fase 6. |
| D4 | Regla "no 2 EN_RUTA" y edición/envío en controller | Se mantienen en `route.ts` (ADR-ARQUITECTURA-001). El front trata los `route.ts` como su contrato. |
| D5 | Fix cancelar (deuda #3): unificar a un endpoint/rol | `DELETE /api/embarques/[id]` con **ADMIN+ASISTENTE**; `DELETE /api/embarques?id=` se deja como alias deprecado o se elimina (a confirmar en Fase 2). |
| D6 | `botellones` sin `requireOwnership` (#6) | Se corrige en Fase 2 (bug de seguridad, no espera a la pantalla). |
| D7 | Reconciliation: ¿wizard forzado (no saltar pasos) o secciones libres con validación? | **Wizard forzado** con pasos: Pedidos → Ventas libres → Físico/Conciliación → Gastos → Preview autoritativo → Confirmar. |

### 2.2 Fases, entregables y criterios de éxito

> Los "criterios de éxito" se reconstruyen aquí a partir de `(1).md` (A.4–A.10) + `01-ux-contract.md` + el código, porque el plan no los detalla por pantalla. Cada fase es **1 PR** salvo que se indique.

---

#### FASE 2 — Contratos + correcciones de plomería (PR-1) ✅ EN CURSO

**Entregables (scope real tras verificación 2026-08-27):**
- `docs/embarques/02-api-contract.md` — los 12+ grupos de endpoints, shapes de request/response, códigos de error, mapeo a `03-exception-model.md`, y §14 de deuda restante. ✅
- `01-ux-contract.md` + `03-exception-model.md` de BORRADOR → Aceptado (aprobados 2026-08-27); `01` §4 revierte "sustitución fuera de alcance". ✅
- Fix #3 (cancelar): `DELETE /api/embarques?id=` pasa a ADMIN+ASISTENTE (match `[id]`). ✅
- Fix #4 (`PESOS_KG`): `src/lib/embarque-capacidad.ts` re-exporta de `Carga.ts` (dominio). ✅
- Fix #5 (`GastoEmbarqueSchema`): el route importa de `@/lib/validators`. ✅
- Fix #6 (`botellones requireOwnership`): ya estaba (`374d5503`) — solo se documenta. ✅
- Tests: ajustar `src/app/api/embarques/__tests__` para el nuevo rol de cancelar por colección.

**Criterios de éxito:**
- `npx tsc --noEmit` + `npm run test` + `npx eslint` (touched files) verdes.
- `02-api-contract.md` cubre el 100% de los endpoints reales.
- `grep "PESOS_KG =" src/lib` vacío (solo re-export).
- Test: `DELETE /api/embarques?id=` responde 403 a un rol no autorizado y 200 a ASISTENTE.

**Rollback:** revertir PR; todo aditivo/independiente. Sin cambios de schema.

---

#### FASE 3 — Command Center (reemplaza la tab "Embarques" de `/embarques`) (1 PR) ✅ IMPLEMENTADO

Detalle de ejecución y decisiones en `docs/embarques/fase3-command-center.md`. Flag `NEXT_PUBLIC_EMBARQUES_V2` (default ON). CTA de tarjeta = rótulo en el link al detalle (mutación real en Fases 4/5).

**Qué es:** vista de conjunto con las 6 fases derivadas, agrupada, con acción rápida por tarjeta y KPIs arriba. Sustituye la lista plana + los 8 botones de filtro actuales.

**Composición:**
- SC `page.tsx`: mantener la query, agregar `loading.tsx` (ya existe). Pasar datos serializados.
- `command-center/index.tsx` (nuevo) — orquesta; consume `GET /api/embarques`, `GET /api/embarques/stats`, realtime `embarque.*`, polling 60s fallback.
- `command-center/fase-column.tsx` / `fase-group.tsx` — agrupación por `FaseUIEmbarque` (`FASES_ORDEN`).
- `command-center/embarque-card.tsx` — evolución de `embarque-card.tsx` actual: badge de fase + capacidad + **fila de "actividad reciente"** (último movimiento físico / recovery abierto / faltante de caja) leída de los datos que ya trae el embarque; CTA contextual (`derivarSiguientePaso`).
- `command-center/kpi-row.tsx` — reusa `stats-kpi-cards` / `embarque-stats`.
- Filtros: colapsar los 8 botones en el agrupado por fase + un select de rango de fecha (ya existe `DateRangeFilter`).

**Criterios de éxito:**
- Desktop: grid/columnas por fase. Mobile: lista apilada con encabezado de fase sticky. `data-testid="command-center-desktop"` / `"command-center-mobile"`.
- 4 estados de red: loading (skeleton `loading.tsx`), success, offline (última lista de Dexie + badge "sin conexión"), error (reintentar).
- Cada tarjeta muestra: nº, repartidor, ruta, fase derivada, capacidad, nº pedidos, y **al menos un dato reciente del backend nuevo** cuando aplica (movimiento / recovery / deuda).
- CTA por tarjeta ejecuta el `siguientePaso` correcto (BORRADOR→registrar carga, CONFIRMADO→enviar, EN_RUTA→cerrar).
- Realtime: un cambio de otro usuario (crear/enviar/cerrar) se refleja sin refresh.
- Tests: `command-center.test.tsx` (agrupación, CTA, estados de red con mocks), E2E `embarques.spec.ts` actualizado (grid → columnas por fase).
- No se persiste ningún estado nuevo (grep: ningún `PUT`/`PATCH` de `estado` fuera de enviar/cerrar/cancelar).

**Rollback:** flag `NEXT_PUBLIC_EMBARQUES_V2=false` → render del `embarques-client` actual (se conserva hasta Fase 10).

---

#### FASE 4 — Preparation Flow (1 PR) ✅ IMPLEMENTADO

Detalle en `docs/embarques/fase4-preparation-flow.md`. **Se reconsideró el wizard de 4 pasos** a favor de un flujo guiado por deep-link (`?step=`) que conecta crear→asignar→enviar reusando el form existente — mismo valor ("nunca un dead-end"), sin regresión sobre la lógica de override de stock. El wizard forzado se aplica en el cierre (Fase 7), donde el PO lo pidió.

Plan original (referencia): "wizard crear → asignar → preparar → enviar"

**Qué es:** convierte la secuencia actual (modal crear → navegar → menú hover → asignar → editar carga → enviar) en un flujo guiado con "siguiente paso" siempre visible.

**Composición:**
- `preparation-flow/wizard.tsx` (nuevo) — stepper: **1. Datos** (repartidor/ruta/moto/base) · **2. Carga** (productos + validación stock/peso contra reglas backend, sin reimplementar) · **3. Pedidos** (asignar, con proyección de capacidad — ya existe la lógica en `embarque-client`) · **4. Revisar y enviar**.
- Reusa `EmbarqueFormModal` desmontado en pasos, o extrae su form a `preparation-flow/steps/*`. Reusa `AutoGenerarPreviewModal` como entrada alternativa ("generar automático").
- Todas las mutaciones vía `fetchResilient` (ya migradas: crear/asignar/enviar/quitar). Confirmar `auto` (#8).
- Entrada: botón "Nuevo embarque" del Command Center y CTA de tarjetas BORRADOR/PREPARANDO.

**Criterios de éxito:**
- Desktop: wizard horizontal. Mobile: stepper vertical. `data-testid` por vista.
- No se puede "enviar" sin pasar por carga+pedidos (o confirmación explícita de "envío para venta libre" — regla ya existe en `handleEnviar`).
- Paso "asignar" es el más expuesto a 2G: si cae la red, encola y muestra badge, no bloquea el wizard.
- 4 estados de red por paso.
- El wizard NO reimplementa `validarStock`/`validarCapacidadPeso`: muestra el error del backend (mapeado a `03-exception-model.md`).
- Tests: `preparation-flow.test.tsx` (navegación, gating, offline en "asignar"), E2E `embarque-create-form.spec.ts` reescrito.

**Rollback:** flag; el `EmbarqueFormModal` clásico sigue accesible.

---

#### FASE 5 — Mission Detail (reemplaza `/embarques/[id]`) (1 PR)

**Qué es:** vista "viva" de la misión: cabecera con fase + siguiente paso, acción primaria clara (sin menú hover), tabs Pedidos/Clientes/Físico, y **panel de estado operativo** (excepciones abiertas: recovery pendiente, faltante de caja, discrepancia física).

**Composición:**
- `mission-detail/index.tsx` (reescritura de `embarque-client.tsx`, partiendo del actual — no from-scratch ciego).
- `mission-detail/header.tsx` — nº, fase, capacidad, **CTA primaria como botón sólido** (no `hover:block`); acciones secundarias en un menú accesible por click (no hover).
- `mission-detail/estado-operativo.tsx` (nuevo) — lee recovery/deudas/discrepancias del `GET /[id]?full=true` y las presenta como tarjetas de excepción (tipos de `03-exception-model.md`).
- Reusa tal cual: `LedgerTab`, `RecoveryFormModal`, `BotellonesPanel`, tabla de pedidos/clientes, `ClienteHistorialModal`.
- Realtime ya está (`f1e73866`); deep link ya está (`31a0c7de`) — confirmar en tests.
- Fix #7: reemplazar `hidden group-hover:block` por un menú controlado por estado (`useState` + click-outside), con `data-testid` estable.

**Criterios de éxito:**
- Acción primaria siempre visible y clickeable en touch (target ≥ 40px).
- Panel de estado operativo muestra 0..N excepciones con su tipo real (no taxonomía inventada).
- 4 estados de red; el botón "Enviar" encola offline.
- Desktop: tabs. Mobile: accordion/segmented. `data-testid` por vista.
- Realtime: cambio de pedido/embarque de otra sesión refresca sin F5 (test E2E multi-contexto — `embarques-all-contexts.spec.ts`).
- Tests: `mission-detail.test.tsx`, E2E de `embarques-dedicado.spec.ts` + `flujo-embarque-despachado-mobile.spec.ts` actualizados.

**Rollback:** flag.

---

#### FASE 6 — Physical + Recovery + Sustitución (2 PRs) — DENTRO DE ALCANCE (D3 = "la necesito")

**PR-6a (backend, additivo — NO cambia schema):**
- `docs/adr/ADR-SUSTITUCION-001.md` — decisión de exponer la operación ya modelada. `construirMovimientosSustitucion` (en `ledger-fisico.service.ts`) y el modelo `Sustitucion` **ya existen en dominio + schema + tests**; esto solo los cablea a un endpoint. No es un cambio del contrato congelado (no hay tabla/columna/lock nuevos); es cerrar un gap señalado por la propia auditoría (B.6).
- `POST /api/embarques/[id]/sustituciones` — thin controller: valida Zod, `requireRole([ADMIN, ASISTENTE])` + `requireOwnership`, llama `construirMovimientosSustitucion`, persiste 2 `EmbarqueMovimiento` (`RECEPCION_DEFECTUOSA` + `ENTREGA`) + 1 `Sustitucion` en una transacción, `logAudit`, realtime `embarque.updated`. Idempotente por `offlineId`.
- `GET /api/embarques/[id]/sustituciones` — lista para el detalle.
- Tests: unitario del controller + integración (2 movimientos + 1 Sustitucion, idempotencia por replay).

**PR-6b (UI, dentro del Mission Detail / tab Físico):**
- `mission-detail/sustitucion-form-modal.tsx` — producto defectuoso → producto de reemplazo, cantidad, motivo. Reusa el patrón de `recovery-form-modal.tsx`.
- El tab "Físico" lista las sustituciones junto a movimientos/recovery/botellones.
- `fetchResilient` + `offlineId`.

**Criterios de éxito:**
- Una sustitución produce **exactamente 2 movimientos físicos separados** (regla ADR-FISICO-001 / §9 plan maestro) + 1 `Sustitucion` que los vincula — nunca un movimiento ambiguo con dos efectos.
- Replay con mismo `offlineId` → no duplica.
- `npx prisma validate` verde (no hay cambio de schema, pero se corre por si acaso).
- Desktop + mobile + 4 estados de red en el modal.
- Tests unit + integración + E2E (`embarques-fisico.spec.ts` extendido).

**Rollback:** el endpoint es additivo (revertir PR); la UI está detrás del flag `EMBARQUES_V2`.

---

#### FASE 7 — Reconciliation (reemplaza `/embarques/[id]/cerrar`) (1–2 PRs)

**Qué es:** cierre guiado, wizard **forzado**, con preview autoritativo del backend como único número que se muestra antes de confirmar.

**Composición:**
- `reconciliation/wizard.tsx` (reescritura de `cerrar-client/index.tsx`, partiendo del actual).
- Pasos forzados: **1. Pedidos** (entregado/no entregado + productos + precios reales) · **2. Ventas libres** · **3. Físico / Conciliación** (retorno, discrepancias) · **4. Gastos** · **5. Preview** (`POST /cerrar/preview` — número autoritativo, sin `useMemo` de negocio; `calculos` local solo como fallback offline explícitamente etiquetado) · **6. Confirmar**.
- Reusa `CerrarEmbarqueSchema`, `pedido-cuadre.tsx`, `venta-libre-row.tsx`, `confirm-modal.tsx`, `CierrePresenter`.
- El envío final ya usa `fetchResilient` + dedup por `offlineId`.

**Criterios de éxito:**
- No se llega a "Confirmar" sin pasar por "Preview".
- El "Preview" muestra el resultado de `/cerrar/preview` (backend), no un recálculo de negocio en cliente. Divergencia imposible por construcción.
- Offline: si `/preview` no responde, se muestra el `calculos` local con banner "cálculo provisional sin conexión — el servidor confirmará al sincronizar".
- 4 estados de red; wizard desktop/mobile con `data-testid` por vista.
- Faltante de caja > umbral → muestra que se generará `ResponsibilityCase` (tipo `MONEY_MISMATCH` de `03-exception-model.md`) y exige justificación.
- Tests: `reconciliation.test.tsx`, E2E `embarque-close-form.spec.ts` + `embarques-fisico.spec.ts` actualizados; test de "preview == cierre real" (ya existe `cierre-preview-dry-run.test.ts`, extender a la UI).

**Rollback:** flag; `cerrar-client` actual se conserva hasta Fase 10.

---

#### FASE 8 — Test hardening (cierra los 4 "Parcial" de A.10) (1–2 PRs)

- `EstadoEmbarque` / `EmbarqueTransitionsService`: test dedicado de todas las transiciones válidas/inválidas (confirmar qué falta tras `f7cfc535`).
- Concurrencia real (no "forma") para asignar / enviar / cerrar: `Promise.allSettled` contra Postgres, patrón de `recovery.service.test.ts`.
- Timeout/offline real: test que simula corte de red (`fetchResilient` con `AbortController` forzado) y afirma el estado de UI resultante, no inspección por regex.
- `POST /api/embarques/auto`: test unitario de `computePreview` + atomicidad crear+asignar.

**Criterios de éxito:** los 4 puntos pasan de "Parcial" a "Cubierto" con test ejecutado (no estático). Suite completa verde.

---

#### FASE 9 — Migración gradual (1 PR)

- Flag `NEXT_PUBLIC_EMBARQUES_V2` a `true` por default en todos los entornos.
- Verificación en producción (Vercel Pro) con los 6 usuarios; checklist de `AGENTS.md` post-deploy.
- Ventana de observación (métricas §2.3) antes de Fase 10.

---

#### FASE 10 — Retiro de UI legacy (1 PR)

- Eliminar `embarques-client/index.tsx` viejo, `cerrar-client` viejo, `embarque-client.tsx` viejo, el flag y sus ramas.
- Actualizar tests E2E que aún apunten a selectores legacy.
- `docs/embarques/` refleja el estado final.

---

### 2.3 Observabilidad (por fase, no al final)

Reusar el patrón de métricas del backend (`docs/adr`/plan maestro §24). Añadir contadores de UI:
- `embarques_v2_render_count` por pantalla.
- `embarques_offline_enqueue_count` por acción (crear/asignar/enviar/cerrar).
- `reconciliation_preview_fallback_count` (preview falló → se usó cálculo local).
- `preparation_flow_abandon_step` (en qué paso se abandona el wizard).

### 2.4 Orden de PRs

```
PR-1   Fase 2   — 02-api-contract.md + fixes plomería (#3 #4 #5 #6)
PR-2   Fase 3   — Command Center
PR-3   Fase 4   — Preparation Flow
PR-4a  Fase 6a  — ADR-SUSTITUCION-001 + POST/GET /api/embarques/[id]/sustituciones  (backend, antes de Mission Detail)
PR-4b  Fase 5   — Mission Detail  (incluye tab Físico con sustituciones)
PR-5   Fase 6b  — Sustitución UI (si no entró completa en PR-4b)
PR-6   Fase 7   — Reconciliation
PR-7   Fase 8   — test hardening
PR-8   Fase 9   — flag a default true + verificación prod
PR-9   Fase 10  — retiro de legacy
```

Fases 3/4/7 pueden solaparse una vez mergeada la Fase 2. Fase 5 depende de PR-4a (endpoint de sustitución).

### 2.5 Verificación por PR (protocolo AGENTS.md §22)

```bash
npx tsc --noEmit
npm run test
npx prisma validate      # solo PRs que toquen schema (ninguno en este plan)
npx eslint . --max-warnings 0
# + los E2E de la pantalla afectada
```

Ninguna fase se cierra por "compila". Cada una demuestra: componente + estados de red + offline + realtime + tests + rollback.

### 2.6 Gate de esta Ronda 2

- [ ] PO aprueba las decisiones D1–D7.
- [ ] PO aprueba el orden de PRs y el alcance (Fase 6 fuera).
- [ ] Con el OK, se ejecuta PR-1 (Fase 2) y se vuelve a pedir gate antes de PR-2.

---

## Iteraciones 2 y 3 del protocolo

- **Iteración 2:** tras implementar PR-1, la Ronda 1 se re-ejecuta con el `02-api-contract.md` real como input; se ajustan los criterios de éxito de Fases 3–7 a los shapes exactos documentados.
- **Iteración 3:** tras PR-2 (Command Center) en producción, la Ronda 1 se re-ejecuta con métricas reales de uso; se refina el resto.
