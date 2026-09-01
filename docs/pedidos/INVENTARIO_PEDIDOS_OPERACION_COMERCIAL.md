# INVENTARIO_PEDIDOS_OPERACION_COMERCIAL

**Estado:** Revisión de contraste — propuesta para aprobación del PO
**Baseline técnico:** `main` / `230c896a9ab8acbfd2f8c7ccb78bb247b940aeed`
**Fecha:** 2026-08-31
**Fuentes contractuales:** ALS Operación Comercial Pedidos + Plan Técnico v1.1 + `plan-maestro-v11.1-equipo-desarrollo.md` + `docs/adr/*` + contratos de Embarques/Planificador.
**Regla:** este documento NO crea un contrato paralelo. Su función es clasificar lo existente como PASS / FAIL / GAP y determinar el siguiente trabajo.

> **Nota de verificación (contraste cruzado contra el código, 2026-08-31).** El contenido del equipo
> fue verificado símbolo por símbolo. Es exacto. Esta versión incorpora 4 correcciones marcadas
> `[C1]`…`[C4]`: (C1) referencias `archivo:línea` precisas donde faltaban; (C2) un FAIL nuevo —
> anular/cancelar no revierten `Pago`/`ReceivableEntry`; (C3) la rama del plan de abonos está
> desactualizada; (C4) `estadoPago` se reclasifica de GAP a VERIFICAR.

> **Estado de Fase 1 (2026-08-31, rama `docs/pedidos-fase0-contraste`).** Cerrada.
>
> | Ítem | Commit | Nota |
> |---|---|---|
> | F1 auditoría transaccional | `fix(pedidos): F1` | `logAudit(entry, tx)` en pagar-fiado/abonos/cierre |
> | G1 idempotencia `/api/abonos` | `fix(pedidos): G1` | `Abono.offlineId @unique` + migración `20260831_add_abono_offline_id` + cliente |
> | F2 consolidar transiciones | `refactor(pedidos): F2` | `pedido-utils.ts` es fachada; tabla canónica en los VO |
> | F3 (parte concurrente) | `fix(pedidos): F3 (parte 1)` | `ActualizarPedidoUseCase` bajo `PEDIDO:{id}`. Resto de F3 (writes crudos en `enviar`/`venta-libre`/`recurrentes`) → **Fase 2 con G5** (necesita la decisión de estado canónico) |
> | F6 unificar 409 | `fix(pedidos): F6` | `enviar` `PEDIDO_YA_ASIGNADO` 400→409. C1 resuelto: no hace falta constraint DB extra (`embarqueId` es una sola columna FK) |
> | G10 roles | `docs(pedidos): G10` | No era decisión — `isLoginCapableRole` ya excluye EMPACADOR/ENTUBADOR. Solo se documentó |
> | G9 specs | `docs(pedidos): G9` | `.claude/specs/pedidos.md` reescrito; `embarques.md` → mapa que redirige a los docs autoritativos |
>
> **Fase 2 — ADRs aprobados (PO 2026-09-01), orden de implementación:**
> 1. `ADR-PEDIDO-ORIGEN-CANAL-001` (G6) — `canal` enum, `tipo` eliminado. Menor riesgo.
> 2. `ADR-PEDIDO-ESTADO-CANONICO-001` (G5, G7) — `estadoEntrega` canónico, `estadoPago` proyección. Habilita el resto de F3 y G2.
> 3. `ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001` (F4, F5, G8) — entrega posterior, `embarqueOrigenId`, escritor de `ANTICIPADO`.
> 4. `ADR-PAGO-REPORTADO-CONFIRMADO-001` (G4) — confirmación de pago (usuario designado).
> 5. `ADR-CORRECCION-MONETARIA-001` (G2, F7) — depende de G5. `CorreccionAbono` + `ReceivableTipo.REVERSION`.
>
> **PRs independientes (fuera de los ADR):** PR-A `pagar-fiado` → `saldoFavor` (D.6).
> **VERIFICAR:** G7 (resuelto por G5), G11 (`AjustarPedidoCantidad` — decidir corrección declarada vs demanda nueva).

---

## 0. Decisión de alcance

El contraste confirma que **no corresponde ejecutar el ALS/Plan Técnico como una reconstrucción desde cero**.

El repositorio ya contiene una parte sustancial del contrato:

- módulo DDD `src/modules/pedidos/`;
- máquinas de estados de entrega/pago;
- locks de aplicación;
- idempotencia por `offlineId` en comandos que ya la soportan;
- offline-first;
- cuatro familias de ledger;
- `ResponsibilityCase`;
- `ObligacionPendiente`;
- `PedidoCantidadAjuste`;
- `RecoveryDecision`;
- `ReceivableEntry`;
- integración Planificador → Embarque;
- conflictos de asignación;
- `EstadoEntrega`, `EstadoPago`, `NO_ENTREGADO`;
- `OrigenPedido.VENTA_LIBRE`;
- `ActividadTipo.COBRO` y `RECOGIDA_BOTELLON`.

Por tanto:

> **La Fase 0 es de contraste y autoridad, no de diseño de dominio.**

No se modifica el dominio congelado hasta cerrar los FAIL/GAP y, cuando corresponda, aprobar el ADR específico.

---

# 1. Convenciones

| Estado | Significado |
|---|---|
| PASS | La cláusula está cubierta por código actual + decisión/ADR existente y no requiere reconstrucción. |
| FAIL | Existe una contradicción entre implementación y contrato/ADR congelado. Requiere corrección. |
| GAP | No existe la capacidad o decisión necesaria. Requiere ADR y/o implementación. |
| HISTÓRICO | Evidencia antigua; no determina el estado actual. |
| VERIFICAR | Existe evidencia parcial o una semántica que todavía requiere contraste adicional antes de convertirla en decisión. |

**Regla de trazabilidad:** cada fila debe poder llevar a un archivo/símbolo real y a un ADR real. No se crean taxonomías nuevas para llenar la matriz.

---

# 2. PASS — contrato ya cubierto

| Ref. | Cláusula | Evidencia actual (archivo:símbolo) | ADR | Estado |
|---|---|---|---|---|
| P1 | Origen ≠ entrega | `prisma/schema.prisma` `enum OrigenPedido` (L42–47), `Pedido.origen` (L659) separado de `Pedido.estadoEntrega` (L660). | — | PASS |
| P2 | Pago ≠ entrega | `Pedido.estadoPago` (L661) y `Pedido.estadoEntrega` (L660) columnas independientes. `EntregarPedidoUseCase` recorta `totalPagado` aparte del estado de entrega. | — | PASS |
| P3 | Pago puede anteceder/seguir a entrega | `src/modules/pedidos/domain/value-objects/EstadoPago.ts` (`TRANSICIONES_PAGO` L10–17) y `EstadoEntrega.ts` (`TRANSICIONES` L11–18): máquinas separadas. | — | PASS |
| P7 | Offline reintentable | `src/lib/fetch-resilient.ts` (`fetchResilient`), `src/lib/db/offline.ts` (Dexie `requestQueue` v5), `src/lib/db/sync.ts` (`syncWithServer`, DLQ). `Pedido.offlineId @unique` (L678) + claves dedicadas por comando (L684–690). | ADR-OFFLINE-001 | PASS |
| P8 | Concurrencia backend | `src/lib/locks.ts` (`withAdvisoryLock` dueño de la tx, `LOCK_NAMESPACES` L30–41). CHECK constraints `20260610_add_check_constraints`. Partial unique index `Actividad_obligacion_embarque_activa_unique`. | ADR-CONCURRENCIA-001 | PASS |
| §24 | Idempotencia de comandos ya soportados | `CrearPedidoUseCase` (dedup dentro del lock), `EntregarPedidoUseCase` (`entregaOfflineId`), `enviar/route.ts` (`envioOfflineId`), `AnularPedidoUseCase.ts:34` / `CancelarPedidoUseCase` (`anulacion/cancelacionOfflineId`). Columnas `@unique` dedicadas. | ADR-IDEMPOTENCIA-001 | PASS |
| §22 | Pago multi-obligación FIFO | `src/app/api/pedidos/pagar-fiado/route.ts` bajo `withAdvisoryLock('CARTERA', clienteId)` (L46); dedup + reconstrucción de `pagosAplicados` en replay (L48–80). | ADR-CARTERA-001 | PASS |
| §28 | Pedido → Planificador → Embarque | `src/modules/planificador/application/use-cases/MaterializarPlanUseCase.ts` reutiliza `CrearEmbarqueUseCase` (L100); `PUT /api/embarques/[id]` `409 PEDIDOS_YA_ASIGNADOS` (L470–476). | ADR-PLANIFICADOR-003 | PASS |
| §30 | Ruta ≠ Plan ≠ Embarque | `ReplanUseCase` rechaza `CONFIRMED` → `PLAN_YA_CONFIRMADO`; `PrismaPlanificadorRepository.estaDesactualizado()` (L239–275). | ADR-PLANIFICADOR-001/002 | PASS |
| §19 | MONEY_MISMATCH no implica culpa automática | `CerrarEmbarqueUseCase.ts` crea `ResponsibilityCase` (FALTANTE_CAJA / DISCREPANCIA_INVENTARIO); el cargo económico solo en `ResolverResponsibilityCaseUseCase` con `autorizadoPorId` obligatorio. | ADR-RESPONSABILIDAD-001 | PASS |
| §18 | Dinero en custodia | `Embarque.baseDinero`/`dineroEntregado` (schema L891–892); `cerrar-embarque-caja.helper.ts` (`calcularCajaFinal` L38, `sobranteFaltante` L52). | ADR-CUSTODIA-001 | PASS |
| §16 | Límite de fiados después de conocer el pago | `CrearPedidoUseCase`: chequeo de límite solo si `totalPagado < total`. Regresión: `src/modules/pedidos/application/use-cases/__tests__/fiado-limite-solo-si-queda-saldo.test.ts`. | — | PASS |
| §27 | Timestamps offline | `Pedido.occurredAt`/`capturedAt`/`serverReceivedAt`/`clasificacionTemporal` (schema L696–699); `src/lib/venta-libre-clasificacion.ts` (`clasificarVentaLibre`). | ADR-OFFLINE-001 | PASS |

### Evidencia técnica clave

- `prisma/schema.prisma`: `EstadoPedido` (L15–22), `EstadoEntrega` (L24–31), `EstadoPago` (L33–40), `OrigenPedido` (L42–47), `ActividadTipo` (L117–121), `Pedido` (L640–803), `Pago` (L837–858), `Abono` (L1518–1541), `ReceivableEntry` (L1230–1260).
- `src/modules/pedidos/domain/value-objects/EstadoEntrega.ts` / `EstadoPago.ts`: máquinas de transición canónicas.
- `src/lib/pedido-utils.ts`: **copia** legacy de transiciones (ver F2).
- `src/lib/locks.ts`: contrato de advisory locks.
- `src/lib/audit.ts`: `logAudit(entry, tx?)`.
- `src/lib/fetch-resilient.ts`, `src/lib/db/sync.ts`: infraestructura offline.
- `src/modules/embarques/application/use-cases/CerrarEmbarqueUseCase.ts`: cierre que consume pedidos.
- `src/lib/receivable-entry.ts`: proyección monetaria.
- `src/app/api/pedidos/pagar-fiado/route.ts`: aplicación FIFO de cartera.

---

# 3. FAIL — contradicciones reales

## F1 — Auditoría transaccional

**Cláusulas:** ALS §37 / Plan §51.

**Realidad:** `src/lib/audit.ts` sí soporta `logAudit(entry, tx)` y, cuando recibe `tx`, re-lanza el error para provocar rollback. El problema no es la capacidad del helper; es que las rutas críticas llaman `logAudit` **fuera** de la transacción, sin `await` y tragando el error.

**Evidencia `[C1]`:**

| Ruta | Línea | Patrón |
|---|---|---|
| `src/app/api/pedidos/pagar-fiado/route.ts` | `:236` | `logAudit({...})` post-commit, sin `tx`, sin `await` |
| `src/app/api/abonos/route.ts` | `:163` | `logAudit({...}).catch(() => {})` fuera del `withAdvisoryLock` |
| `src/app/api/cierre/route.ts` | `:593` | `logAudit({...})` post-`$transaction`, sin `tx` |
| **Contraste correcto** | `src/modules/pedidos/application/use-cases/CrearPedidoUseCase.ts:290` | `await logAudit({...}, tx)` dentro del lock |
| **Contraste correcto** | `src/modules/pedidos/application/use-cases/AnularPedidoUseCase.ts:77` | `await logAudit({...}, tx)` |

**Clasificación:** FAIL.

**Corrección:** pasar el delegate transaccional a `logAudit`, mantener la auditoría dentro de la transacción crítica y no tragar el error cuando el contrato exige atomicidad. Fase 1.

---

## F2 — Tres fuentes de transiciones

**Cláusula:** P5 — una sola fuente por hecho.

**Realidad actual `[C1]`:**

1. `src/modules/pedidos/domain/value-objects/EstadoEntrega.ts` (`TRANSICIONES` L11–18) + `EstadoPago.ts` (`TRANSICIONES_PAGO` L10–17) — **canónico**.
2. `src/lib/pedido-utils.ts` — `TRANSICIONES_ENTREGA` (L8–15) y `TRANSICIONES_PAGO` (L17–24) **copiadas byte-a-byte**, más `calcularEstadoPago` (L44), `calcularSaldo` (L53), `legacyToNewState` (L227), `getBadge*` (L86–120).
3. `EstadoEntregaSchema` / `EstadoPagoSchema` en `src/lib/validators.ts` (L39–40) — lista de valores Zod (sin lógica de transición).

Consumidores legacy que importan de `pedido-utils.ts`: `src/app/api/pedidos/venta-libre/route.ts`, `src/app/api/pedidos/pagar-fiado/route.ts`, `src/lib/recurrentes.ts`, `alertas-utils.ts`.

**Clasificación:** FAIL.

**Corrección:** `pedido-utils.ts` debe convertirse en fachada/re-export compatible del dominio, no en segunda máquina de estados. **No romper consumidores legacy** durante la consolidación. Fase 1.

---

## F3 — Mutaciones críticas fuera de comandos de dominio

**Cláusulas:** Plan §48.

**Evidencia `[C1]`:**

| Archivo | Línea | Write crudo |
|---|---|---|
| `src/app/api/pedidos/[id]/enviar/route.ts` | `:152-161` | `tx.pedido.updateMany({ data: { estado, estadoEntrega } })`, guard solo por string check + `WHERE embarqueId: null` |
| `src/app/api/pedidos/venta-libre/route.ts` | `:210-212` | `pedido.create` con `estadoEntrega: ENTREGADO`, `estado: ENTREGADO` |
| `src/lib/recurrentes.ts` | `:160`, `:492`, `:720`, `:745` | writes crudos de `estadoEntrega` PENDIENTE/ENTREGADO/CANCELADO |
| `src/modules/pedidos/application/use-cases/ActualizarPedidoUseCase.ts` | `:82` | `txManager.execute(...)` — `prisma.$transaction` plano, **sin advisory lock, sin idempotencia**; recompone total + factura + estado |

**Clasificación:** FAIL.

**Corrección:**
- encapsular transiciones en `src/modules/pedidos/domain/services/pedido-transitions.service.ts`;
- validar transición antes del write;
- `ActualizarPedidoUseCase`: envolver en `withAdvisoryLock('PEDIDO', id)` + aceptar `offlineId`;
- no crear un segundo motor de transición. Fase 1.

---

## F4 — Venta Libre fuerza ENTREGADO

**Cláusulas:** ALS §12 / Plan §21 y §35.

**Evidencia `[C1]`:**
- `src/app/api/pedidos/venta-libre/route.ts:209-212`: `origen = VENTA_LIBRE`, `estadoEntrega = ENTREGADO`, `estado = ENTREGADO` (legacy), conserva `embarqueId`.
- `src/modules/embarques/domain/services/crear-ventas-libres.service.ts:77-79`: `estadoEntrega: 'ENTREGADO'`, `estado: 'ENTREGADO'`, `cXPed = cXEnt`.

Contradice el contrato nuevo si la venta en ruta puede representar una operación comercial cuya entrega real ocurre posteriormente.

**Clasificación:** FAIL.

**Corrección:** requiere ADR genuinamente nuevo (`ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001`) antes de cambiar comportamiento. Fase 2.

---

## F5 — Venta Rápida fuerza entrega

**Evidencia `[C1]`:** `src/modules/pedidos/application/use-cases/CrearPedidoUseCase.ts` — `origen === VENTA_RAPIDA` ⇒ `estadoEntrega = ENTREGADO` e ítems `cantEntrega = cantidad`.

Impide representar universalmente: `captura rápida → pago anticipado → entrega posterior`.

**Clasificación:** FAIL respecto al nuevo contrato ALS (§50.3.D).

**Corrección:** ADR específico (`ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001` cubre venta rápida y venta libre); no cambiar solo la línea de código. Fase 2.

---

## F6 — 409 inconsistente

**Evidencia `[C1]`:**
- `src/app/api/pedidos/[id]/enviar/route.ts:229`: `PEDIDO_YA_ASIGNADO` → **400**.
- `src/app/api/embarques/[id]/route.ts:470-476`: `PEDIDOS_YA_ASIGNADOS` → **409**.

**Nota adicional `[C1]`:** **ninguno de los dos caminos tiene un constraint de DB** que garantice "una asignación activa". Ambos dependen del guard `WHERE embarqueId IS NULL` dentro del `updateMany`, ejecutado dentro del advisory lock (`enviar` sin lock, solo el guard + write conflict de fila; `PUT embarques` bajo `EMBARQUE_CARGA:{id}`), más un post-check del `count` afectado.

**Clasificación:** FAIL.

**Corrección:**
1. unificar el contrato HTTP a `409 Conflict` para conflicto de estado/payload por concurrencia;
2. evaluar un índice/constraint que garantice a nivel DB "una asignación activa por pedido" (ALS §36). Fase 1 (punto 1) / Fase 2 si el constraint requiere migración con backfill.

---

## F7 `[C2]` — Anular/Cancelar no revierten `Pago` ni `ReceivableEntry`

**Cláusulas:** ALS §21 / Plan §26–27 / P4 ("hecho histórico no se edita destructivamente").

**Evidencia:**
- `src/modules/pedidos/application/use-cases/AnularPedidoUseCase.ts:53-74`: `pedido.anular()` pone `totalPagado → 0`; `facturaRepo.anularByPedidoId` (misma tx); si `tuvoPagos` crea una `NotaCredito` por `totalPagado`. **No toca las filas `Pago` ni genera `ReceivableEntry`.**
- `src/modules/pedidos/application/use-cases/CancelarPedidoUseCase.ts`: mismo patrón (`totalPagado = 0`, `total = 0`, NC si hubo pagos).
- `src/lib/receivable-entry.ts:17`: `ReceivableTipo = 'PAGO' | 'ABONO'` — **cerrado**, sin `REVERSION`/`ANULACION`.

Resultado: tras anular, `Pedido.totalPagado = 0` pero los `ReceivableEntry` previos siguen con `totalPagadoResultante`/`saldoResultante` viejos, y no hay entrada de reversión. Divergencia latente entre canónico y proyección.

**Clasificación:** FAIL.

**Corrección:** **no es un GAP nuevo** — es un sub-ítem del scope de G2 (corrección de abonos). La extensión de `ReceivableTipo` con `REVERSION`/`ANULACION` y el modelo `CorreccionAbono` append-only lo cubren. Fase 2, dentro de G2.

---

# 4. GAP — ausencias reales

## G1 — Idempotencia de `/api/abonos`

`POST /api/abonos` (`src/app/api/abonos/route.ts:42-188`) **no acepta `offlineId` ni deduplica**. Usa `withAdvisoryLock('CARTERA', clienteId)` (L55), pero lock ≠ idempotencia. `AbonoCreateSchema` (`src/lib/validators.ts:312-318`) no tiene `offlineId`.

`Abono` y `CierreDia` no tienen ninguna clave idempotente en el schema.

**Riesgo:** doble POST → doble abono.

**Acción:** `Abono.offlineId String? @unique` (migración aditiva + `GRANT app_write`, ver AGENTS.md 1FN), deduplicación dentro de `CARTERA:{clienteId}` (patrón `pagar-fiado/route.ts:48-80`), cliente offline con `fetchResilient`. Cruza ADR-IDEMPOTENCIA-001 (que ya lista `abonos`/`deudas` como diferidos). Fase 1.

---

## G2 — Corrección/reversión/reaplicación de abonos

No existen `/api/pagos/[id]/revertir` ni `/api/pagos/[id]/reaplicar` (grep-confirmado: `src/app/api/pagos/` no existe; `src/app/api/abonos/` solo tiene `route.ts` GET+POST).

**No crear un plan paralelo.** Adoptar y contrastar `docs/abonos-correccion/REVISION_CONSOLIDADA_CORRECCION_ABONOS.md` + la decisión histórica `[[abonos-correccion-plan-v5]]`.

**`[C3]` — La rama fuente está desactualizada.** El doc vive en `origin/docs/abonos-correccion-consolidada` (`251a3dc1`), que está **12 commits detrás de `main`** y revierte el módulo `nuevo-embarque` (~3600 líneas presentes en `main`). Acción: traer **solo el archivo** —
`git checkout main -b docs/abonos-rebase && git checkout origin/docs/abonos-correccion-consolidada -- docs/abonos-correccion/` — nunca mergear la rama. Registrar en `[[abonos-correccion-plan-v5]]`.

El modelo `CorreccionAbono` append-only + extensión de `ReceivableTipo` debe resolverse contra ese corpus (7 decisiones de producto abiertas + 3 bloqueantes) **antes** de modificar schema. Incluye el scope de F7 `[C2]`. Fase 2.

**Estado (2026-09-01): CERRADO — `ADR-CORRECCION-MONETARIA-001` (Aceptado).** El PO convergió D.1–D.7:
- **D.1** v1 = corrección de **abono individual** (no multi-factura como una operación; revertir un batch FIFO = N correcciones).
- **D.2** roles **ADMIN + CONTADOR**; reconciliar `pagar-fiado` (hoy ADMIN+ASISTENTE).
- **D.3** modelo `CorreccionAbono` append-only, numerado, vínculo obligatorio al `Abono`. No abono negativo, no reusar `NotaCredito`, no `DELETE`.
- **D.4** el **mismo mecanismo** cubre la reversión al anular/cancelar pedido pagado, vía `ReceivableTipo.REVERSION` (resuelve F7 `[C2]`). G2 no es "una pantalla", es "reversión monetaria unificada".
- **D.5** sección **"Cartera"** nueva, permiso `view:cartera`, ADMIN + CONTADOR.
- **D.6** el fix `pagar-fiado` → `saldoFavor` es **PR independiente** (PR-A), fuera de G2 (PR-B).
- **D.7** "pago no recibido" reutiliza **`ResponsibilityCase PAGO_NO_CONFIRMADO`** (compartido con `ADR-PAGO-REPORTADO-CONFIRMADO-001`). El dominio de pagos ≠ el dominio antifraude.

Depende de G5 (`proyectarEstadoPago` para el recálculo de `estadoPago`).

---

## G3 — commandId / batchId

No existe un `commandId` genérico. Sí existe `offlineId` dedicado por comando (columnas `@unique` en `Pedido`) y batch específico (`Pedido.recurrenteBatchId`, `offlineId` compartido no-unique en `Pago`/`ReceivableEntry` para el batch FIFO).

**Conclusión:** esto NO es automáticamente un gap de schema. Antes de agregar `commandId`, debe demostrarse un caso de dominio que `offlineId + batch específico` no pueda representar.

**Estado (2026-09-01): CERRADO — no se agrega `commandId`/`batchId` genérico.** `ADR-CORRECCION-MONETARIA-001` D.1 evita el caso que lo motivaba: la corrección es **por abono individual** (`correccionOfflineId @unique` por comando), no una operación multi-obligación. Si en el futuro se prioriza la corrección multi-factura como una sola operación, esa extensión del ADR añadirá `Abono.grupoCorrelacionId` — pero eso es un batch específico, no un `commandId` genérico.

---

## G4 — Pago reportado vs confirmado

No existe un estado explícito que distinga `REPORTADO → CONFIRMADO / DISCREPANTE`. Lo más cercano: `Pedido.disputaAbierta Boolean` (schema L700) + `resolver-disputa/route.ts`. Concepto genuinamente nuevo.

**Clasificación:** GAP.

**Acción:** `ADR-PAGO-REPORTADO-CONFIRMADO-001` (aditivo sobre `Pago`; decisión de producto pendiente: quién confirma, cuándo, efecto en caja). Cruza ADR-MONETARIO-001. Fase 2.

---

## G5 — `Pedido.estado` vs `estadoEntrega`

Coexisten `Pedido.estado` (`EstadoPedido`, L710) y `Pedido.estadoEntrega` (`EstadoEntrega`, L660). `estado` es mirror legacy, mantenido en sync por `src/modules/pedidos/infrastructure/mappers/PedidoMapper.ts` (`toPrismaCreate`/`toPrismaUpdate` escriben ambos) y por los writes crudos de F3.

**Clasificación:** GAP de decisión. No debe eliminarse todavía.

**Acción:** `ADR-PEDIDO-ESTADO-CANONICO-001` — declara `estadoEntrega` canónico, `estado` mirror a retirar con expand-contract (ADR-MIGRACION-001) y backfill verificable. Fase 2.

---

## G6 — origen vs canal vs tipo

`OrigenPedido` es enum (schema L42–47), pero `Pedido.tipo` (L652, default `"ENVIO"`) y `Pedido.canal` (L653, default `"DOMICILIO"`) siguen siendo `String` libres.

**Clasificación:** GAP de contrato.

**Acción:** `ADR-PEDIDO-ORIGEN-CANAL-001` — mapa `OrigenPedido` × `canal` × `tipo` × mecanismo de captura; qué es enum, qué se deriva, qué se elimina. No renombrar masivamente todavía. Fase 2.

---

## G7 `[C4]` — Semántica de `estadoPago` → **VERIFICAR**

El enum `EstadoPago` (schema L33–40) contiene `PENDIENTE`, `PARCIAL`, `PAGADO`, `ANTICIPADO`, `VENCIDO`, `ANULADO`. Pero:

- `ANTICIPADO`: valor y transición válidos en `EstadoPago.ts`, pero **ningún code path lo escribe** (grep-confirmado).
- `VENCIDO`: solo lo escribe el cron `src/app/api/cron/vencimiento-promesas/route.ts:46` (diario, `promesaPagoFecha < now`).
- La UI deriva un 4º estado de presentación (`src/modules/pedidos/presentation/visual-states.ts` `calcularEstadoPagoVisual`; `pedidos-client/index.tsx` `getEstadoPagoBadge`) que no siempre coincide con la columna.

**Clasificación:** **VERIFICAR** (reclasificado de GAP). No es una ausencia; es una semántica sin resolver. El ADR de Fase 2 (`ADR-PEDIDO-ESTADO-CANONICO-001`) decide si `estadoPago` es canónico (y quién escribe `ANTICIPADO`) o proyección de `(total, totalPagado, promesaPagoFecha)`. Hasta entonces no genera trabajo de implementación.

---

## G8 — `embarqueOrigenId`

No existe un campo persistente que conserve el embarque desde el cual se originó una venta (grep-confirmado: no hay `embarqueOrigenId` en el schema). Hoy: `origen = VENTA_LIBRE` + `embarqueId`, y `embarqueId` se pone `null` cuando el pedido pasa a `NO_ENTREGADO` y se reasigna (`ProcesarPedidoService.procesarNoEntregado`, `CancelarEmbarqueUseCase`).

**Clasificación:** GAP.

**Acción:** `ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001` añade `Pedido.embarqueOrigenId` (persistente, aditivo, nunca se limpia al reasignar). Cruza ADR-REASIGNACION-001. Fase 2.

---

## G9 — Specs desactualizadas

`.claude/specs/pedidos.md` y `.claude/specs/embarques.md` predatan: `NO_ENTREGADO`, `Pedido.estadoPago` como columna, los 4 ledgers, el Planificador, todas las `*OfflineId`, `pagar-fiado`, `venta-libre`, `ajustar-cantidad`, `resolver-disputa`, `PedidoCantidadAjuste`/`ObligacionPendiente`/`Actividad`, `direccionEntrega`.

**Clasificación:** GAP documental. No modificar código para satisfacer specs antiguas.

**Acción:** reescribir ambos specs contra el estado real. Fase 1 (sin código).

---

## G10 — Roles DB vs roles de aplicación

`prisma/schema.prisma` `enum RolUsuario` (L57–65) incluye `EMPACADOR` y `ENTUBADOR`; `src/lib/constants.ts` `ROLES` (L2–8) tiene 5 valores (`ADMIN, CONTADOR, ASISTENTE, REPARTIDOR, SELLADOR`). `EMPACADOR`/`ENTUBADOR` no aparecen en `ROLES` ni en `src/lib/permissions.ts`.

**Clasificación:** GAP menor.

**Acción:** decidir — roles de DB sin acceso a la app (documentar), o permisos mínimos explícitos en `permissions.ts`. PR de una línea + test. Fase 1.

---

## G11 — Faltante → **VERIFICAR**

Dos mecanismos que deben distinguirse:

1. `src/modules/pedidos/application/use-cases/AjustarPedidoCantidadUseCase.ts` — bajo `withAdvisoryLock('PEDIDO', id)`, crea una fila `PedidoCantidadAjuste` con `autorizadoPorId` obligatorio. **No muta `PedidoItem` ni recomputa totales del pedido.**
2. `src/modules/pedidos/application/use-cases/EntregarPedidoUseCase.ts` — si `item.faltante > 0` crea un **pedido-hijo** `PENDIENTE` con `idOrigen = parent.id`, `obs = "Faltante de pedido #N"`.

**Clasificación:** VERIFICAR. Debe comprobarse si ambos representan corrección de cantidad declarada, demanda pendiente nueva, o dos fases del mismo hecho. No modificar hasta resolver la semántica. ADR solo si la semántica lo exige. Fase 2.

---

# 5. Matriz de ADR

| ADR | Tema | Estado | Fase |
|---|---|---|---|
| ADR-IDEMPOTENCIA-001 | Idempotencia por comando | Existente; completar abonos (G1) | F1 |
| ADR-CARTERA-001 | FIFO cartera | Existente | PASS |
| ADR-CONCURRENCIA-001 | Advisory locks | Existente | PASS |
| ADR-PLANIFICADOR-001/002/003 | Planificación/materialización | Existente | PASS |
| ADR-RESPONSABILIDAD-001 | Responsabilidad/cargos | Existente | PASS |
| ADR-OFFLINE-001 | Timestamps/offline | Existente | PASS |
| ADR-MONETARIO-001 | Ledger/proyección monetaria | Existente | PASS |
| ADR-MIGRACION-001 | Expand-contract / histórico | Existente (aplica a G5) | F2 |
| ADR-REASIGNACION-001 | Reasignación por incidencia | Existente (aplica a G8) | F2 |
| **ADR-PEDIDO-ORIGEN-CANAL-001** | Origen/canal/tipo (G6) | **Aceptado** (PO 2026-09-01) | F2 — orden 1 |
| **ADR-PEDIDO-ESTADO-CANONICO-001** | Estado canónico (G5, G7) | **Aceptado** (PO 2026-09-01) | F2 — orden 2 |
| **ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001** | Venta en ruta + `embarqueOrigenId` (F4, F5, G8) | **Aceptado** (PO 2026-09-01) | F2 — orden 3 |
| **ADR-PAGO-REPORTADO-CONFIRMADO-001** | Pago reportado/confirmado (G4) | **Aceptado** (PO 2026-09-01) | F2 — orden 4 |
| **ADR-CORRECCION-MONETARIA-001** | Corrección de abono individual + `ReceivableTipo.REVERSION` (G2, F7) | **Aceptado** (PO 2026-09-01, D.1–D.7). Depende de G5 | F2 |
| Botellón: actividad/pedido/obligación | Solo si G11 resulta GAP real | Condicional | F2 |

---

# 6. Roadmap de ejecución

## Fase 0 — Contraste y autoridad

**Bloquea todo lo demás.** Entregables: este inventario (D0.1 + D0.3), `FASE_0_PEDIDOS_OPERACION_COMERCIAL.md` (D0.2), matriz Plan ↔ Código, mapa ADR ↔ cláusula, listas FAIL/GAP, decisión de alcance UI (abierta).

**Gate 0:** PO aprueba la clasificación con `[C1]`–`[C4]` incorporadas; ningún cambio de dominio/schema antes del gate.

## Fase 1 — Cerrar FAIL backend

Orden: F1 auditoría → G1 idempotencia abonos → F2 transiciones → F3 writes críticos → F6 409 → G10 roles → G9 specs.

Cada PR: pequeño, aditivo cuando sea posible, tests + `tsc` + `eslint` + `prisma validate` + E2E del área + rollback definido. Formato §75.

## Fase 2 — Decisiones genuinamente nuevas

Orden: estado canónico → origen/canal/tipo → pago reportado/confirmado → venta en ruta + entrega posterior + `embarqueOrigenId` → corrección de abonos (corpus existente, incluye F7) → command/batch solo si aparece un caso real → botellón si la semántica permanece abierta.

**Regla:** ningún cambio de schema antes del ADR aprobado (Gate 2).

## Fase 3 — UI/UX

Solo después del contraste. Primero definir: qué información ya existe, qué decisiones necesita el usuario, qué acciones son válidas por estado, qué contexto viene de Embarque/Planificador, qué información de pago es confirmada, qué acciones son comandos.

Opciones: **A)** rework completo detrás de `NEXT_PUBLIC_PEDIDOS_V2` (si el contraste muestra inconsistencias estructurales); **B)** incremental (si el problema es UX concentrada). En ambos: lógica de negocio solo backend, acciones contextuales, `data-testid` desktop/mobile, separación filtros/triggers, contexto de embarque heredado, rollback por flag si es V2.

## Fase 4 — Red E2E

No recrear. Mapear `OC-01…OC-24` contra `ciclo-pedido-completo.spec.ts`, `ciclo-repartidor.spec.ts`, `fiados-trazabilidad.spec.ts`, `offline-full-flow.spec.ts`, `race-conditions/*`, `embarques-cierre-wizard.spec.ts`, suites offline existentes.

Tests nuevos: dos `pagar-fiado` concurrentes sobre la misma cartera; `/api/abonos` concurrencia (post-G1); pago antes de entrega; venta en ruta con entrega posterior (post-ADR); pago reportado no confirmado (post-ADR); duplicado de abono; payload conflict de abono y de `PUT /api/pedidos/[id]`.

---

# 7. Gates

- **Gate 0 — autoridad.** Aprobado: PASS / FAIL / GAP / VERIFICAR; qué ADR es existente; qué ADR es nuevo; qué no se toca.
- **Gate 1 — backend coherente.** Demostrar schema + API + servicio + transacción + concurrencia + offline + auditoría + rollback. No basta compilar.
- **Gate 2 — decisiones de dominio.** Cada ADR nuevo aprobado antes de tocar schema.
- **Gate 5 — UI.** La UI no contradice dominio. Con flag OFF (si V2), el comportamiento anterior permanece.
- **Gate 8 — release.** E2E crítico verde + reauditoría adversarial.

---

# 8. Guardrails vinculantes

1. Reutilizar → adaptar → extender → construir.
2. No crear segundo motor de pricing.
3. No crear segundo motor de capacidad.
4. No crear segundo mecanismo Pedido → Embarque.
5. No crear `VentaEnRuta` sin ADR que demuestre necesidad.
6. No crear tercer estado de entrega.
7. No renombrar masivamente `VentaLibre`.
8. No quitar locks existentes.
9. No usar `offlineId` compartido para hechos atómicos independientes.
10. No editar históricos destructivamente.
11. No tocar `src/modules/embarques/domain/**` o `src/modules/planificador/**` sin ADR.
12. No PR gigante.
13. No refactor masivo sin tests.
14. Si falta una sección del formato de PR exigido por §75, NO LISTO PARA MERGE.

---

# 9. Conclusión

El contraste cambia el problema:

**No necesitamos diseñar Pedidos desde cero.**

Necesitamos:

```text
CORPUS CONGELADO + CÓDIGO ACTUAL
      ↓
CONTRASTE
      ↓
FAIL reales + GAP genuinos
      ↓
PRs pequeños + ADRs nuevos solo donde corresponde
      ↓
UI basada en evidencia
      ↓
E2E
      ↓
AUDITORÍA ADVERSARIAL
```

El principal riesgo ahora no es "falta de arquitectura". Es **crear una segunda arquitectura encima de la existente**. Este documento es el punto de entrada obligatorio antes de cualquier reconceptualización adicional de Pedidos.
