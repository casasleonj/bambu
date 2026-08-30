# Contrato de API — Embarques (Fase 2)

- Estado: **Aceptado** — 2026-08-27
- Base: `01-ux-contract.md` (aprobado), `ADR-ARQUITECTURA-001` (actualizar/enviar/listar viven en el controller por diseño), `plan-maestro-embarques-autocontenido-equipo-desarrollo.md` (contrato de dominio congelado).
- **Autoridad:** los `route.ts` bajo `src/app/api/embarques/`. Este documento los describe; si diverge del código, gana el código y se corrige este archivo.
- Alcance: todo endpoint que las pantallas de Fases 3–7 consumen. Las pantallas **no** reimplementan reglas de negocio (stock, peso, caja, discrepancia) — muestran el error del backend mapeado a `03-exception-model.md`.

---

## 0. Convenciones

- **Envelope de respuesta:** `apiSuccess(data, status?)` → `{ success: true, ...data }`; `apiError(msg, status?, extra?)` → `{ success: false, error: { message, ...extra } }`. (helpers en `src/lib/api-response.ts`.)
- **Auth:** `requireAuth()` (401 si no hay sesión) → `requireRole([...])` (403) → `requireOwnership('embarque', id, user)` (403). `requireOwnership` solo hace chequeo real para `REPARTIDOR` (`trabajador.userId === user.id`); para `ADMIN`/`ASISTENTE`/`CONTADOR` devuelve `true`.
- **Offline-first:** las mutaciones marcadas ✅ aceptan `offlineId` (string, `crypto.randomUUID()` del cliente) en el body y son idempotentes: un replay con el mismo `offlineId` devuelve el resultado ya aplicado con `deduped: true` (status 200), nunca un 500 por constraint.
- **Rate limiting:** todas las rutas `/api/embarques/*` pasan por `src/proxy.ts` (300 req/min, auth-before-rate-limit). No hay excepciones aquí.
- **Realtime:** las mutaciones publican `embarque.created|updated|deleted` y/o `pedido.updated` vía Redis (`publishRealtimeEvent`, best-effort, nunca bloquea la respuesta).
- **Montos:** el backend serializa `Decimal`/`Date` a `number`/ISO string antes de responder. El cliente nunca recibe `Prisma.Decimal`.

---

## 1. Colección — `/api/embarques`

### `GET /api/embarques`

| | |
|---|---|
| Auth | `requireAuth`. `REPARTIDOR` → filtrado a su `trabajadorId` (si no tiene `Trabajador`, devuelve lista vacía). |
| Query | `desde`, `hasta` (YYYY-MM-DD, rango parcial soportado vía `buildDateRangeFilter`); `all=true` (ignora fecha, sin límite de filas); `estado` (`ABIERTO`\|`EN_RUTA`\|`CERRADO`\|`CANCELADO`); `stock=true` (adjunta `stock` + `tieneStockEstimado`). Sin `desde`/`hasta`/`all` → default "hoy" (Bogotá), **incluye CANCELADO**. |
| Respuesta | `{ embarques: EmbarqueListItem[], total, stock?, tieneStockEstimado? }` |

`EmbarqueListItem` (campos consumidos por el Command Center):
```
id, numero, numeroDia, estado, fecha, horaSalida, horaLlegada,
trabajador: { id, nombre, capacidadKg, com* },
ruta: { id, nombre } | null,
tipoMoto, baseDinero, obs,
productos: EmbarqueProducto[],            // ledger de carga/retorno por producto
_count: { pedidos },
pedidos: PedidoEnEmbarque[]  (take 50, enriquecidos con negocio),
// derivados por el backend en la respuesta:
totalPacas, pesoKg, capacidadKg, capacidadInfo: CapacidadInfo
```
> El Command Center deriva la **fase UI** (`BORRADOR|PREPARANDO|CONFIRMADO|EN_RUTA|CERRADO|CANCELADO`) con `derivarEstadoUI` a partir de `estado` + `pedidos.length` + carga. Nunca se persiste.

### `POST /api/embarques` — crear

| | |
|---|---|
| Auth | `ADMIN`, `ASISTENTE` |
| Offline | ✅ `offlineId` (idempotente vía `CrearEmbarqueUseCase`) |
| Body | `EmbarqueCreateSchema`: `{ trabajadorId, rutaId?, tipoMoto?, baseDinero?, horaSalida: "HH:MM", obs?, carga: [{ producto, cargadas }], offlineId? }` |
| Delega | `CrearEmbarqueUseCase` (valida stock/peso/moto/`MAX_UNIDADES_EMBARQUE`) |
| OK | `201 { embarque }` |
| Errores | `400` TRABAJADOR_NOT_FOUND / sin moto / `STOCK_INSUFFICIENT: …` / excede máximo de N unidades / peso-capacidad · `409` "ya tiene un embarque abierto hoy" / P2002 |

### `DELETE /api/embarques?id={id}` — cancelar (alias de colección)

| | |
|---|---|
| Auth | `ADMIN`, `ASISTENTE` — **unificado en Fase 2** (antes solo `ADMIN`, inconsistente con `DELETE /api/embarques/[id]`). |
| Delega | `CancelarEmbarqueUseCase` (reasigna pedidos no entregados a `PENDIENTE`, marca `CANCELADO`) |
| OK | `200 { message }` |
| Errores | `400` "Solo se pueden cancelar embarques abiertos" · `404` EMBARQUE_NOT_FOUND |
| Nota | Preferir `DELETE /api/embarques/[id]` (tiene `offlineId` + lock `EMBARQUE_CARGA`). Este alias queda para compat; candidato a retiro en Fase 10. |

---

## 2. Recurso — `/api/embarques/[id]`

### `GET /api/embarques/[id]?full=true`

| | |
|---|---|
| Auth | `requireAuth` + `requireOwnership` |
| Respuesta | `{ embarque: EmbarqueDetalle }` — incluye `pedidos` completos (enriquecidos: dirección efectiva, negocio, coords), `productos`, `deudas` (faltante de caja), `capacidadInfo`. `404` "Not found". |
| Consumido por | Mission Detail (Fase 5), Reconciliation (carga inicial). |

### `PUT /api/embarques/[id]` — editar / asignar pedidos

| | |
|---|---|
| Auth | `ADMIN`, `ASISTENTE` + `requireOwnership` |
| Offline | ✅ `offlineId` (dedup manual dentro de `withAdvisoryLock('EMBARQUE_CARGA', id)`) |
| Body | `EmbarqueUpdateSchema`: `{ pedidoIds?: string[], trabajadorId?, rutaId?, tipoMoto?, baseDinero?, carga?: [{producto, cargadas}], offlineId? }` — campos editables solo en `ABIERTO`; `pedidoIds` asigna/reemplaza. |
| Lógica | **inline en el route** (ADR-ARQUITECTURA-001) — TOCTOU fix F-N12, valida stock/peso/`MAX_UNIDADES_EMBARQUE`. |
| OK | `200 { embarque }` · replay → `{ deduped: true, embarque }` |
| Errores | `400` "Use el flujo de cierre…" (si intenta cerrar por acá) / EMBARQUE_NOT_EDITABLE / excede máximo N / peso-capacidad / stock / "No se pueden editar estos campos en estado X" · `404` EMBARQUE/TRABAJADOR_NOT_FOUND |

### `DELETE /api/embarques/[id]` — cancelar

| | |
|---|---|
| Auth | `ADMIN`, `ASISTENTE` + `requireOwnership` |
| Offline | ✅ `offlineId` en el body (opcional) |
| Lock | `withAdvisoryLock('EMBARQUE_CARGA', id)` |
| Reglas | solo `ABIERTO` se cancela; `EN_RUTA`/`CERRADO` → `EMBARQUE_NO_CANCELABLE`. Ya `CANCELADO` → `{ deduped: true }`. Reasigna pedidos no `ENTREGADO` a `PENDIENTE`. |
| OK | `200 {}` · replay → `{ deduped: true, embarque }` |
| Errores | `400` "Solo se pueden cancelar embarques abiertos" · `404` |

---

## 3. Transición — `POST /api/embarques/[id]/enviar`

| | |
|---|---|
| Auth | `ADMIN`, `ASISTENTE` + `requireOwnership` |
| Offline | ✅ `offlineId` |
| Body | `{ offlineId? }` |
| Lógica | **inline** en `executeSerializableWithRetry` (ADR-ARQUITECTURA-001). Regla de dominio que solo vive acá: **un trabajador no puede tener 2 embarques `EN_RUTA` simultáneos** (F-N1). Embarque vacío → solo `ADMIN`/`ASISTENTE` pueden enviarlo (venta libre). |
| Transición | `ABIERTO → EN_RUTA`, registra `horaSalida`. |
| OK | `200 { embarque }` · replay → `{ embarque, deduped: true }` |
| Errores | `403` "Solo ADMIN o ASISTENTE pueden enviar embarques sin pedidos" · `409` trabajador ya tiene un `EN_RUTA` · `404` |

---

## 4. Cierre — `/api/embarques/[id]/cerrar`

### `POST /api/embarques/[id]/cerrar` — cerrar (real)

| | |
|---|---|
| Auth | `ADMIN`, `ASISTENTE` + `requireOwnership` |
| Offline | ✅ `offlineId` + `CierreDedupService.esReplay()` |
| Body | `CerrarEmbarqueSchema`: `{ pedidos: [{ pedidoId, entregado, productosEntregados?, pagos: [{metodo, monto}], preciosReales?, nuevoEmbarqueId? }], ventasLibres?: [...], productos (retorno), gastos?, dineroEntregado, justificacionDiscrepancia?, justificacionFaltante?, obs?, offlineId }` |
| Delega | `CerrarEmbarqueUseCase` (thin controller real). Doble lock `CIERRE` → `SECUENCIA` (orden anti-deadlock). |
| Transición | `EN_RUTA → CERRADO` (atómica, sin reversibilidad). |
| OK | `200 CierrePresenter.toLegacyResponse(...)` — cuadre de caja, comisión, discrepancias, deudas/`ResponsibilityCase` generados. |
| Errores | `400` EMBARQUE_YA_CERRADO / `PAGOS_EXCEDIDOS: …` / transición inválida · `404` EMBARQUE / EMBARQUE_DESTINO_NOT_FOUND · `400` EMBARQUE_DESTINO_NO_DISPONIBLE |

### `POST /api/embarques/[id]/cerrar/preview` — dry-run (autoritativo)

| | |
|---|---|
| Auth | igual que el cierre real |
| Body | igual, **sin `offlineId`** (un preview nunca debe calzar con la detección de replay). |
| Delega | `CerrarEmbarqueUseCase.execute({ …, dryRun: true })` — misma conciliación, mismo cálculo de caja, misma transacción, **rollback antes del commit**. No persiste, no dispara realtime/notificaciones. |
| OK | `200 CierrePresenter.toLegacyResponse(...)` — idéntico shape al cierre real. |
| Uso | **La pantalla de Reconciliation (Fase 7) muestra ESTE número antes de "Confirmar".** El cálculo local (`useMemo`) queda solo como fallback offline, etiquetado "provisional". Cubierto por `src/lib/__tests__/integration/cierre-preview-dry-run.test.ts`. |

---

## 5. Auto-generar — `POST /api/embarques/auto`

| | |
|---|---|
| Auth | `ADMIN`, `ASISTENTE` |
| Offline | ❌ (pendiente A.3.2 — verificar en Fase 4) |
| Body | `EmbarqueAutoSchema`: `{ dryRun?: boolean, asignaciones?: [{ trabajadorId, rutaId?, pedidoIds }] }` |
| `dryRun: true` | `computePreview` (Prisma directo) → `{ dryRun: true, maxUnidades, message, ...preview }` (agrupación propuesta por zona, editable). |
| `dryRun: false` | `CrearEmbarqueUseCase` por asignación + `pedido.updateMany` **fuera de esa transacción** (⚠️ crear+asignar no es atómico — hardening en Fase 8). `{ dryRun: false, created, creados, errores, message }`. |
| Errores | `400` "Parámetros inválidos" / "No hay asignaciones para confirmar" / "No hay repartidores activos" (`NO_REPARTIDORES`) |

---

## 6. Ledger físico — `/api/embarques/[id]/movimientos`

| | |
|---|---|
| Auth GET | `requireAuth` + `requireOwnership` → `{ movimientos: EmbarqueMovimiento[] }` |
| Auth POST | `ADMIN`, `ASISTENTE` + `requireOwnership` |
| Offline | ✅ `offlineId` (unique en DB) |
| Body | `MovimientoSchema`: `{ tipo: 'REEMPAQUE'|'DESCARTE'|'CUSTODY_TRANSFER'|'AJUSTE_AUTORIZADO', producto, cantidad>0, origen?, destino?, metadata?, offlineId? }` |
| Reglas | `validarMovimientoFisico` (dominio, ADR-FISICO-001): `cantidad` siempre positiva, efecto por `tipo`. `AJUSTE_AUTORIZADO` exige `metadata.effect` (`INCREASE`\|`DECREASE`) + `authorization` + `userId`. |
| OK | `201 { movimiento }` · replay → `{ movimiento, deduped: true }` |
| Gap conocido | sin `logAudit` (Fase 8). |

---

## 7. Recovery — `/api/embarques/[id]/recovery`

| | |
|---|---|
| Auth GET | `requireAuth` + `requireOwnership` → `{ recovery: RecoveryDecision[] }` |
| Auth POST | `ADMIN`, `ASISTENTE` + `requireOwnership` |
| Offline | ✅ `offlineId` |
| Body | `RecoverySchema`: `{ tipo: 'SOBRANTE'|'FALTANTE', producto, cantidad, sourceEventId?, pedidoOrigenId?, pedidoDestinoId?, reason, offlineId? }` |
| Delega | `CrearRecoveryDecisionUseCase`. **SOBRANTE** exige `sourceEventId` consumible + lock `RECOVERY_SOURCE`. **FALTANTE** prohíbe inventar evento de origen. `0 ≤ cantidadAplicada ≤ cantidad`. |
| OK | `201 result` (nueva) · `200 result` (`deduped`) |
| Errores | `404` SOURCE_EVENT_NOT_FOUND · `409` `DOBLE_CONSUMO: …` (SOBRANTE ya consumido por decisión concurrente) · `400` validación |

---

## 8. Botellones — `POST /api/embarques/[id]/botellones`

| | |
|---|---|
| Auth | `ADMIN`, `ASISTENTE`, **`REPARTIDOR`** + `requireOwnership` (fix `374d5503` — un repartidor solo sobre su embarque). |
| Offline | ✅ `offlineId` |
| Body | `BotellonesSchema`: `{ accion: 'RECOGIDA'|'ENTREGA', cantidad>0, offlineId? }` |
| Reglas | recogida (`RETORNO`) y entrega (`ENTREGA`) son **siempre movimientos separados** (ADR-BOTELLONES-001). No se transforma automáticamente una en otra. |
| OK | `201 { movimiento }` · replay → `{ movimiento, deduped: true }` |
| Agregación | "Recogidos/Entregados/En custodia" se derivan client-side de `GET /movimientos` (no hay endpoint de agregación server-side — pendiente si un cliente API lo necesita). |

---

## 9. Sustituciones — `/api/embarques/[id]/sustituciones` (Fase 6 — NO EXISTE AÚN)

| | |
|---|---|
| Estado | **A construir en PR-6a.** Requiere `ADR-SUSTITUCION-001`. |
| Auth | `ADMIN`, `ASISTENTE` + `requireOwnership` |
| Offline | ✅ `offlineId` |
| Body (propuesto) | `{ productoDefectuoso, productoReemplazo, cantidad>0, pedidoId?, motivo, offlineId? }` |
| Delega | `construirMovimientosSustitucion` (ya existe en `ledger-fisico.service.ts`) → persiste **2 `EmbarqueMovimiento`** (`RECEPCION_DEFECTUOSA` + `ENTREGA`) + **1 `Sustitucion`** que los vincula, en una transacción. |
| OK | `201 { sustitucion, movimientos: [2] }` · replay → `deduped: true` |
| `GET` | `{ sustituciones: Sustitucion[] }` para el tab Físico. |

---

## 10. Optimizar orden (TSP) — `/api/embarques/[id]/optimizar-orden`

| | |
|---|---|
| Auth POST | `requireAuth` + `requireOwnership` (sin `requireRole` explícito) |
| Auth GET | `requireAuth` (⚠️ sin `requireOwnership` — inconsistente con POST) |
| Offline | ❌, **sin lock ni transacción** (dos optimizaciones concurrentes: gana el último `update`). Hardening en Fase 8. |
| POST | recalcula el orden de visita (`optimizeEmbarqueOrden`, `src/lib/geo/`), `prisma.embarque.update`. `409` si `CERRADO`. |
| OK | `200 { orden, distanciaKm, … }` |

---

## 11. Gastos — `/api/embarques/[id]/gastos`

| | |
|---|---|
| Auth | `ADMIN`, `ASISTENTE` + `requireOwnership` (POST). DELETE: `ADMIN`, `ASISTENTE` (sin `requireOwnership` — cosmético, ambos roles pasan). |
| Offline | ❌ |
| Body POST | `GastoEmbarqueSchema` (**ahora en `@/lib/validators`**, fuente única): `{ categoria, monto>0, nota?≤500 }` |
| POST | `executeSerializableWithRetry` (F-N2: no agregar gasto a embarque ya cerrado). |
| Gap conocido | DELETE no llama `logAudit` (Fase 8). |

---

## 12. Stats — `GET /api/embarques/stats`

| | |
|---|---|
| Auth | `requireAuth` (todos los roles) |
| Query | rango de fechas |
| Cálculo | `src/lib/embarque-stats.ts` (puro, separado de I/O) |
| Respuesta | KPIs, series por ruta / por trabajador / timeline. Alimenta la tab Estadísticas y la fila de KPIs del Command Center. |

---

## 13. Mapa endpoint → excepción de UI (ver `03-exception-model.md`)

| Endpoint / error backend | Tipo UI |
|---|---|
| `STOCK_INSUFFICIENT` / "excede límite de stock" (`validarStock`) | `STOCK_INSUFFICIENT` |
| "Peso excede capacidad" / "excede máximo de N unidades" | `CAPACITY_EXCEEDED` |
| `NO_REPARTIDORES` (`/auto`) | `NO_DRIVER_AVAILABLE` |
| `RecoveryDecision` SOBRANTE/FALTANTE; `conciliarProductos` | `PHYSICAL_MISMATCH` |
| `faltanteEfectivo > UMBRAL_MINIMO_FALTANTE_CAJA` → `ResponsibilityCase` | `MONEY_MISMATCH` |
| Rama `NO_ENTREGADO` (`ProcesarPedidoService`) | `DELIVERY_FAILED` |
| Cualquier `400` de Zod no cubierto arriba | `MISSING_DATA` |
| `DOBLE_CONSUMO: …` (recovery `409`) | `DOBLE_CONSUMO` |
| `validarMovimientoFisico` sobre los 2 movimientos de sustitución | `SUSTITUCION_INVALIDA` |

---

## 14. Deuda de API restante (a cerrar en las fases indicadas)

| # | Gap | Fase |
|---|---|---|
| 1 | `/auto`, `/optimizar-orden`, `/gastos` sin `fetchResilient`+`offlineId` | 4 / 5 |
| 2 | `/auto` crear+asignar no atómico | 8 |
| 3 | `/optimizar-orden` sin lock | 8 |
| 4 | `movimientos` / `botellones` / `gastos DELETE` / `DELETE embarques` sin `logAudit` | 8 |
| 5 | `optimizar-orden GET` sin `requireOwnership` | 8 |
| 6 | Sin endpoint de agregación de botellones server-side | si un cliente API lo pide |
| 7 | `capacidadKg` se recalcula desde `Trabajador` en cada lectura (altera históricos); existe `EmbarqueCarga.capacidadKg` snapshot sin usar | ADR propio si se prioriza |
| 8 | `DELETE /api/embarques?id=` duplica `DELETE /api/embarques/[id]` | retiro en Fase 10 |
