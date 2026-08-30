# E2E Failure Matrix — Fase 2

**Base:** run de CI `33307271423` (branch `fix/e2e-recuperacion-8-8` = `origin/main` `5380d26d` + fix `fc949e6` + instrumentación Fase 1 luego revertida).
**Método:** logs completos de los 8 jobs (`gh api .../jobs/<id>/logs`), en `_evidence/` del run baseline y analizados con scripts ad-hoc. `retries: 2` en CI → cada fallo aparece 3× en el log; los conteos de acá están de-duplicados.

---

## 0. Resultado del run Fase 1 vs baseline

| Shard | Proyecto | Baseline failed | Fase 1 failed | Δ |
|------:|----------|----------------:|--------------:|:--|
| 1 | chromium | 11 | 11 | = |
| 2 | chromium | 13 | 13 | = |
| 3 | chromium | 12 | 12 | = |
| 4 | chromium | 2 | 3 | +1 (flaky `session-expiry`) |
| 5 | chromium-mobile | 13 | 13 | = |
| 6 | chromium-mobile | 21 | **35** | **+14 — REGRESIÓN, ver §5** |
| 7 | chromium-mobile | 10 | 10 | = |
| 8 | chromium-mobile | 2 | 3 | +1 (flaky) |

### Hallazgos del run Fase 1

1. **`unhandledRejection: Error: DB_TIMEOUT` → 0 (era 2 en shards 1 y 5).** El fix `fc949e6` (timer huérfano en `POST /api/clientes`) lo resolvió. ✅
2. **Lock-contention del `TRUNCATE`: 0 ocurrencias.** En los 8 shards: 0 `Lock contention on X`, 0 `Terminated N stale connection(s)`, 0 volcados de `pg_stat_activity`. Los 39 `TRUNCATE ... CASCADE` de cada reset completan en **~1 segundo** en total. **La hipótesis H1 del plan (contención de lock ACCESS EXCLUSIVE entre el reset y una transacción en vuelo) NO se está manifestando en CI.** Los fixes `b3162bbf` + `5017df93` (lock_timeout + `terminateStaleConnections`) ya en `main` la neutralizaron, o nunca fue el driver principal.
3. **`"Sesión invalidada: no existe o expiró"`: sigue 19-36×/shard.** No viene de contención — es simplemente el efecto de truncar `SesionActiva` en cada `beforeAll`. Ruido, no causa de fallo por sí mismo (el auth-cache se auto-cura).
4. **La población real de fallos (~84 baseline) son bugs de test/contrato/UI concretos, no un colapso de lifecycle.** Ver §2-§4.

**Conclusión Fase 2:** el plan asumía una causa raíz de lifecycle dominante. **Es incorrecto.** Hay al menos **4 familias de causa raíz independientes**, la mayoría desalineación E2E↔producto tras el trabajo reciente de embarques (Fases 5-8) y de la UI mobile.

---

## 1. Clasificación por familia

| Familia | Clasificación | Specs afectados (aprox.) | Prioridad |
|---|---|---|---|
| **A. Máquina de estados de embarque** | `E2E_OUTDATED` | deudas (2), embarques-all-contexts, embarques-dedicado, flujo-embarque-despachado-mobile, cierre-de-embarque | Alta — patrón único, fix mecánico |
| **B. Envelope de respuesta de API** | `E2E_OUTDATED` / `PRODUCT_CONTRACT` | auth-endpoints:62, ciclo-cancelacion:12, ciclo-credito:12, compras:66 | Alta — pocos, deterministas |
| **C. UI mobile: selectores duplicados / no alcanzables** | `SELECTOR` / `UI_STATE` | mobile-menu:78, fiado-status-ui:34 (fab-main), mobile-clientes, embarques-fisico (×12, ver §5), menu-reorder | Media |
| **D. `networkidle` / timing** | `E2E_OUTDATED` (mala práctica) | user-flow:52, notificaciones/opt-in-toast (×5), varios `Test timeout` | Media — cambio de patrón |
| **E. Lógica de negocio / datos** | `PRODUCT_CONTRACT` a confirmar | recurrentes:209 (APLICAR_CREDITO), deudas:490, productos-comprehensive, mobile-offline:289 | Baja — requieren decisión de contrato |
| **F. Flaky real** | `TRUE_FLAKY` | session-expiry:24, dlq-4xx:13 (solo en retry, 1 de 3) | Baja |

---

## 2. Familia A — Máquina de estados de embarque `ABIERTO → EN_RUTA → CERRADO`

**Síntoma:** `Error: Transicion invalida: ABIERTO -> CERRADO. Permitidas: EN_RUTA, CANCELADO` (server) → el test recibe 400/500 y luego `Cannot read properties of undefined (reading 'deficitCaja')` / `toBe` falla.

**Causa:** `src/modules/embarques/domain/value-objects/EstadoEmbarque.ts:61` define `ABIERTO: ['EN_RUTA', 'CANCELADO']`. Cerrar exige pasar antes por `EN_RUTA` (vía `PUT /api/embarques/{id}` con `{ estado: 'EN_RUTA' }` o `POST /api/embarques/{id}/enviar`). Introducido por el trabajo de embarques (Plan Maestro, Fases 5-8). Specs escritos antes no hacen esa transición.

**Specs ya alineados (patrón a copiar):** `embarques.spec.ts:38-41` (`cerrarEmbarque` helper hace `apiPut(.../embarques/{id}, {estado:'EN_RUTA'})` primero), `ciclo-pedido-completo.spec.ts:15`.

**Fix:** en cada spec que llame `POST /api/embarques/{id}/cerrar` sin pasar por `EN_RUTA`, agregar la transición. Afectados confirmados:
- `deudas.spec.ts` — "Embarque Cash Reconciliation" (2 tests, ~672 y ~731)
- `embarques-all-contexts.spec.ts` — Stock Estimado UI (a verificar)
- `flujo-embarque-despachado-mobile.spec.ts:20`
- `cierre.spec.ts:20` (a verificar)

---

## 3. Familia B — Envelope de respuesta

| Spec | Assertion | Recibido | Diagnóstico |
|---|---|---|---|
| `auth-endpoints.spec.ts:62` | `expect(body.error).toContain('No se requiere cambio')` → `TypeError: c is not iterable` | `body.error` no es string (objeto/array) | El endpoint devuelve `{ error: { formErrors: [...] } }` o similar; el test asume string plano. `E2E_OUTDATED` — usar helper de envelope |
| `ciclo-cancelacion.spec.ts:52` | `expect(anularBody).toHaveProperty('notaCredito')` | `{ pedido: {..., factura: null}, success: true }` | El pedido es `VENTA_RAPIDA` pagado EFECTIVO → **no tiene factura ni crédito** → anular no crea `notaCredito`. El test necesita un pedido **fiado** (con factura) como precondición, o el contrato de la respuesta cambió. **Verificar `src/app/api/pedidos/[id]/anular/route.ts`** |
| `ciclo-credito.spec.ts:49` | `throw 'No se encontró factura para el pedido'` | `POST /api/facturas {pedidoId, clienteId}` no-2xx y no hay factura existente | El comentario del test dice "ventaRapida=true ya crea factura automáticamente" — puede haber dejado de ser cierto, o `POST /api/facturas` ahora exige más campos. **Verificar `CrearPedidoUseCase` + `POST /api/facturas`** |
| `compras.spec.ts:66` ("validacion: sin proveedor") | `Test timeout` esperando que el form guarde / muestre error | La UI no reacciona al submit con proveedor vacío | Puede ser selector (`#compra-proveedor`, `button:has-text("Guardar")`) o que el form quedó `disabled`. `UI_STATE` |

---

## 4. Familia C — UI mobile

| Spec | Error | Diagnóstico |
|---|---|---|
| `mobile-menu.spec.ts:78` | `strict mode violation: getByRole('button', { name: /men[uú]/i }) resolved to 2 elements` | Dos botones con aria-label de "menú" en el DOM (probable: header duplicado desktop+mobile, `AGENTS.md #24`). Fix: `data-testid` único o scope por contenedor responsive |
| `fiado-status-ui.spec.ts:34` | `strict mode violation: getByTestId('fab-main') resolved to 2 elements` | `openNuevoPedidoModal` helper local (línea 23) usa `getByTestId('fab-main').click()` sin `.first()`. El helper compartido `openFabPedidoEnvio` (fixtures.ts:469) ya lo maneja. Fix: usar el helper compartido |
| `mobile-clientes.spec.ts:52,79` | `toBeVisible() failed` (modal de detalle de cliente) | A verificar — puede ser el panel de negocios (`AGENTS.md #19`) o timing |
| `menu-reorder.spec.ts:35,101` | `toBeVisible` / `60s timeout` | Drag handles / persistencia tras refresh en mobile |

---

## 5. REGRESIÓN introducida en Fase 1 (ya revertida)

`prisma/reset-locked.ts` con `stdio: 'inherit'` hacía que `clean.ts` (39 líneas `Cleaned X` + seed) escribiera ~50 líneas por cada `beforeAll` al **stdout del runner de Playwright** (que en CI es un pipe con `stdout: 'pipe'`). Esto frenó el shard 6 (el más grande, mobile) lo suficiente como para que **12 tests de `embarques-fisico.spec.ts`** (que navegan a `/embarques/{id}` y hacen click en `tab-fisico`) superaran el timeout de 30s. `embarques-fisico` **no fallaba en el baseline**.

**Confirmado:** en el baseline (run `33289190333`), `embarques-fisico` = 0 menciones en los 8 logs (pasaba, parte de los 152 passed de shard 6). En Fase 1 = 12 fallos, todos `Test timeout ... waiting for getByTestId('tab-fisico')`.

**Acción:** commit `a9e72020` revierte la instrumentación. El diagnóstico que buscaba (¿hay lock-contention?) **ya se respondió: no**. No se necesita re-instrumentar. Si en el futuro hace falta, escribir a un archivo + subir como artifact, nunca a stdout del runner.

---

## 6. Specs "casi verdes" — objetivo de milestone rápido

Shards 4 y 8 tienen solo 3 fallos cada uno (mismos specs):

| Spec | Familia | Fix |
|---|---|---|
| `proveedores.spec.ts:80` ("editar proveedor") | C/UI_STATE | `button:has-text("Editar")` no aparece o el form no guarda — a reproducir |
| `recurrentes.spec.ts:209` ("aplicar crédito al recurrente") | E | sugerencia `APLICAR_CREDITO` ausente — a verificar contra el motor de sugerencias |
| `user-flow.spec.ts:52` ("No hay errores de hydration ni consola") | D | `page.waitForLoadState('networkidle', {timeout: 10000})` — **`networkidle` nunca dispara** con SSE `/api/realtime` + polling de `SessionProvider`. Cambiar a `domcontentloaded` + wait de elemento. `session-expiry:24` (shard 8) es flaky. |

Cerrar estos 3 pone shards 4 y 8 en verde → **2/8 shards PASS** como primer hito medible.

---

## 7. Roster completo de fallos (run Fase 1, de-duplicado)

### Fallan en `chromium` Y `chromium-mobile` (deterministas, viewport-independiente)

```
auth-endpoints.spec.ts:62        B   TypeError: c is not iterable
ciclo-cancelacion.spec.ts:12     B   toHaveProperty('notaCredito')
ciclo-credito.spec.ts:12         B   No se encontró factura
compras.spec.ts:66               B   Test timeout (form submit)
critical-flows.spec.ts:90        D?  Test timeout
critical-flows.spec.ts:174       D?  Test timeout
deudas.spec.ts:386               C?  toBeVisible (badge deuda)
deudas.spec.ts:451               C?  toBeVisible (progress bar)
deudas.spec.ts:490               E   toBe (nomina auto-descuenta)
deudas.spec.ts:672               A   toBe (deficitCaja / cierre ABIERTO)
deudas.spec.ts:731               A   Cannot read 'deficitCaja'
embarques-all-contexts.spec.ts:279  A?  Test timeout
embarques-all-contexts.spec.ts:316  A?  toBe
embarques-hydration.spec.ts:27   A?  toBe
entrega-gps.spec.ts:19           C?  toBeEnabled
flujo-embarque-despachado-mobile.spec.ts:20  A   toBe
full-user-day.spec.ts:628        E?  toContainText (Asistente no ve Cerrar Dia)
gastos.spec.ts:81                B?  toContainText (validacion sin categoria)
insumos.spec.ts:51               C?  toBeTruthy (crear con proveedor)
mobile-clientes.spec.ts:52       C   toBeVisible
mobile-clientes.spec.ts:79       C   toBeVisible
mobile-menu.spec.ts:78           C   strict mode (2 botones menú)
mobile-offline-comprehensive.spec.ts:289  E   toBeGreaterThanOrEqual
menu-reorder.spec.ts:101         C/D 60s timeout
negocios-crud.spec.ts:20/193     C?  timeout / toBeVisible
nomina.spec.ts:20                C?  toBeVisible
pedidos-all-contexts.spec.ts:971 C?  toBeVisible (tab filtros)
pedidos.spec.ts:217              C?  toBeVisible (?atrasados=true)
productos-comprehensive.spec.ts:41/340/398  E/C  toBe / toBeVisible
proveedores.spec.ts:80           C   toBeTruthy
recurrentes.spec.ts:209          E   toBeDefined (APLICAR_CREDITO)
user-flow.spec.ts:52             D   networkidle timeout
```

### Solo `chromium-mobile` (shard 6/7)

```
embarques-fisico.spec.ts:56..281 (×12)   §5 REGRESIÓN (revertida) — esperar recuperación
embarques-dedicado.spec.ts:7/88/118/147   A/C   timeout / toBe
embarques-fixes.spec.ts:688/726/785/902   A?    toBe
fiado-status-ui.spec.ts:34                C     fab-main ×2
facturas.spec.ts:14                       C?    toBeVisible (page loads)
```

### Solo `chromium` (shard 3)

```
notificaciones/opt-in-toast.spec.ts:22/27/32/38/46 (×5)  D   toast no aparece / timeout
```

---

## 8. Recomendación de re-secuenciado del plan

La Fase 3 original (aislamiento namespaced) **ya no es la prioridad** — no hay evidencia de contaminación por lifecycle en CI. Re-orden propuesto:

1. **Fase 2.5 (nueva):** revertir instrumentación (hecho, `a9e72020`), confirmar shard 6 recupera.
2. **Fase 4 adelantada — Familia A (embarque EN_RUTA):** fix mecánico, ~6-8 tests, 1 commit.
3. **Familia D (`networkidle`, toasts):** cambio de patrón, ~7 tests.
4. **Familia B (envelope):** requiere leer route por route; 4 tests.
5. **Familia C (mobile selectors):** `data-testid` únicos + helpers compartidos.
6. **Familia E:** requiere decisión de contrato del PO — listar y escalar.
7. **Fase 3 (aislamiento) — degradada a "nice to have":** solo si tras A-E aparece contaminación real. El ruido `Sesión invalidada` se puede atacar por separado (no truncar `SesionActiva`, o seed de sesión).
8. Fases 5-7 del plan original (observabilidad, paralelismo, repetibilidad) sin cambios.
