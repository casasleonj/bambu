# E2E Baseline — Recuperación 8/8

**Fase 0 del plan** (`docs/testing/PLAN_RECUPERACION_E2E_8_8.md`).
**Regla de salida:** este documento debe existir y ser reproducible antes de tocar cualquier test/infra. No autoriza por sí mismo ningún cambio.

---

## 1. Commit y entorno

| Campo | Valor |
|---|---|
| Commit baseline | `5380d26d16f89932101e66b603a002c374572cfe` (`origin/main`, 2026-08-29 21:58:14 -0500) |
| Mensaje | `fix(dashboard): fecha en TZ Bogotá + canal en Ventas por Precio (#139)` |
| Run de CI observado | [`33289190333`](https://github.com/casasleonj/bambu/actions/runs/33289190333) — workflow `CI`, trigger `push` a `main` |
| Fecha del run | 2026-08-30 ~02:58 UTC |
| Node en CI | 22 (`.github/workflows/ci.yml`) |
| Runner | `ubuntu-latest` (2 vCPU / 7 GB), Postgres 17.10-alpine + Redis 8-alpine en contenedores locales por shard |
| Playwright | 1.59.1 |
| webServer | `node .next/standalone/server.js` (build de producción, `npm run build`) |

### Config Playwright en el baseline (`playwright.config.ts`)

| Opción | Valor |
|---|---|
| `workers` | `process.env.CI ? 1 : 1` (1 worker por shard) |
| `retries` | `process.env.CI ? 2 : 0` |
| `reporter` | `'html'` (por shard; **no** hay blob + merge) |
| `fullyParallel` | `true` |
| `testIgnore` | `**/exploratory/**`, `**/qa-comprehensive/**`, `**/produccion/**` |
| proyectos | `chromium`, `chromium-mobile` (iPhone 13 viewport, 390×844) |
| matriz de shards | `[1..8]`, `fail-fast: false`, `timeout-minutes: 60` |

### Mecanismo de reset de DB (relevante para el diagnóstico)

- `e2e/fixtures.ts:35-56` → `resetTestDatabase()` / `resetDatabase()` ejecutan `npx tsx prisma/reset-locked.ts {test|full}` con `stdio: 'inherit'` (marcado como diagnóstico temporal).
- `prisma/reset-locked.ts:28-34` → toma `pg_advisory_lock(847362951)` y corre `clean.ts` + seed **con `stdio: 'ignore'`** → anula el `'inherit'` de arriba. El output de `clean.ts` **no llega a CI**.
- `prisma/clean.ts` → `TRUNCATE ... CASCADE` sobre **39 tablas** (incluye `SesionActiva`), cada una con `SET LOCAL lock_timeout = '3000ms'` + retry ×4 con backoff.
- **42 de 81 specs** llaman `resetTestDatabase()`/`resetDatabase()` en `test.beforeAll`. **45 specs** usan `test.describe.configure({ mode: 'serial' })`.

---

## 2. Resultado por shard

| Shard | Proyecto | Total | Passed | Failed | Flaky | Skipped | Did not run | Duración | `DB_TIMEOUT` |
|------:|----------|------:|-------:|-------:|------:|--------:|------------:|---------:|:-----------:|
| 1 | chromium | 208 | 179 | **11** | 0 | 6 | 12 | 13.1 m | **sí (×2)** |
| 2 | chromium | 210 | 160 | **13** | 2 | 25 | 10 | 15.8 m | no |
| 3 | chromium | 206 | 174 | **12** | 0 | 3 | 17 | 17.8 m | no |
| 4 | chromium | 208 | 191 | **2** | 1 | 12 | 2 | 10.1 m | no |
| 5 | chromium-mobile | 207 | 165 | **13** | 0 | 7 | 22 | 16.3 m | **sí (×2)** |
| 6 | chromium-mobile | 209 | 152 | **21** | 2 | 24 | 10 | 21.3 m | no |
| 7 | chromium-mobile | 205 | 135 | **10** | 0 | 12 | 48 | 14.0 m | no |
| 8 | chromium-mobile | 207 | 189 | **2** | 2 | 12 | 2 | 10.6 m | no |

**Total:** ~84 failed, ~7 flaky, ~123 did not run sobre ~1660 tests. **8/8 shards FAIL.**

Ruido sistémico en **todos** los shards: `[WebServer] "Sesión invalidada: no existe o expiró"` entre **20 y 36 veces** por shard, empezando en el minuto 1 del run (no solo tras un reset puntual).

---

## 3. Firmas de fallo observadas (sin clasificar — eso es Fase 2)

### 3.1 `unhandledRejection: Error: DB_TIMEOUT` (shards 1 y 5)

```
shard 1  03:05:05   [WebServer] Error: DB_TIMEOUT
                     [WebServer] ⨯ unhandledRejection:  Error: DB_TIMEOUT   (×2, ~70 ms de diferencia)
shard 5  03:06:56   idem
```

`DB_TIMEOUT` es el reject del `Promise.race([work, timeout(25s)])` en `src/app/api/clientes/route.ts`. La promesa perdedora del race no tiene `.catch()` → `unhandledRejection`. Next.js registra un handler (por eso el `⨯` formateado), el server **no muere** (specs posteriores del mismo shard pasan). Idéntico a `AGENTS.md` Known Issue #20.

### 3.2 Cascada dentro de bloques `serial` (shards 1, 3, 5, 7)

Los fallos se agrupan en los primeros ~6 archivos por orden alfabético (`auth-endpoints`, `ciclo-*`, `compras`, `critical-flows`, `deudas`). Un fallo en un `test.describe.configure({ mode: 'serial' })` marca **todos los tests siguientes del bloque como "did not run"** — explica el conteo alto de "did not run" concentrado en esos archivos. El shard 1 (`chromium`) y el shard 5 (`chromium-mobile`) fallan en **exactamente los mismos specs** → no es un problema de viewport.

### 3.3 Errores de integridad de datos (specs de negocio)

| Spec | Error de server | Lectura |
|---|---|---|
| `ciclo-credito.spec.ts:12` | `Error: No se encontró factura para el pedido` (helper, línea 49) | Pedido fiado creado, factura ausente al leerla después |
| `deudas.spec.ts:490` | `El abono (50000) excede la deuda pendiente (10000)` | La deuda esperada por el fixture no está en el estado real |
| `ciclo-cancelacion.spec.ts:52` | `expect(anularBody).toHaveProperty('notaCredito')` falla | La respuesta de anular no trae `notaCredito` |
| `deudas.spec.ts:386/451` | `locator.click: Test timeout 30000ms exceeded` | La UI no encuentra el elemento (página 500 o datos ausentes) |

### 3.4 Errores que parecen contrato/producto (independientes del lifecycle)

| Spec | Error | Lectura preliminar |
|---|---|---|
| `compras.spec.ts:66` ("validacion: sin proveedor") | `TypeError: c is not iterable` (variable minificada → **500 del server**, no 400) | `POST /api/compras` revienta en la ruta de validación en vez de devolver 400 |
| `deudas.spec.ts:672/731` (Embarque Cash Reconciliation) | `Transicion invalida: ABIERTO -> CERRADO. Permitidas: EN_RUTA, CANCELADO` | El test cierra un embarque directo desde `ABIERTO`; la máquina de estados ahora exige `EN_RUTA` primero (trabajo reciente de embarques). Posible `E2E_OUTDATED` |
| `auth-endpoints.spec.ts:62` | `TypeError: c is not iterable` en `expect(body.error).toContain('No se requiere cambio')` | Igual patrón de 500 con build minificado |

### 3.5 Bug de selector en mobile (shards 6, 7, 8 — proyecto `chromium-mobile`)

```
Error: locator.click: Error: strict mode violation: getByTestId('fab-main') resolved to 2 elements
```

Dos `<button data-testid="fab-main">` en el DOM en viewport mobile. Aparece **7 veces en shard 6**, 1 en shard 7, 1 en shard 8, y **0 veces en los shards `chromium`** (1-4). Causa raíz **independiente** de la cascada de DB — patrón de vistas duplicadas mobile/desktop (`AGENTS.md` #24). Afecta `e2e/fixtures.ts:23` (`openNuevoPedidoModal`) y `openFabPedidoEnvio`.

### 3.6 Otros fallos aislados (shards 4, 8 — casi limpios)

- `proveedores.spec.ts:80` ("editar proveedor")
- `user-flow.spec.ts:52` ("No hay errores de hydration ni consola en flujo principal")
- `session-expiry.spec.ts:24` ("auth:expired event redirects to login with expired banner")

---

## 4. Listado completo de fallos por shard

Ver `e2e/docs/_evidence/shardN.log.gz` (logs completos de CI de cada job, comprimidos). Reproducción:

```bash
# IDs de job del run 33289190333
gh api repos/casasleonj/bambu/actions/jobs/99197694173/logs   # shard 1
gh api repos/casasleonj/bambu/actions/jobs/99197694274/logs   # shard 2
gh api repos/casasleonj/bambu/actions/jobs/99197694258/logs   # shard 3
gh api repos/casasleonj/bambu/actions/jobs/99197694285/logs   # shard 4
gh api repos/casasleonj/bambu/actions/jobs/99197694260/logs   # shard 5
gh api repos/casasleonj/bambu/actions/jobs/99197694259/logs   # shard 6
gh api repos/casasleonj/bambu/actions/jobs/99197694262/logs   # shard 7
gh api repos/casasleonj/bambu/actions/jobs/99197694269/logs   # shard 8
```

<details>
<summary>Shard 1 (chromium) — 11 failed</summary>

```
auth-endpoints.spec.ts:62      force-password-change rejects when mustChangePassword is false
ciclo-cancelacion.spec.ts:12   anular pedido entregado → nota de crédito → factura ANULADA
ciclo-credito.spec.ts:12       ciclo completo: pedido fiado → factura → abonos parciales → PAGADA
compras.spec.ts:66             validacion: sin proveedor
critical-flows.spec.ts:90      Crear un pedido con pago via items array
critical-flows.spec.ts:174     Pedido agendado sin pago es permitido via items array
deudas.spec.ts:386             badge de deuda en card de trabajador
deudas.spec.ts:451             progress bar en deuda card
deudas.spec.ts:490             nomina AUTO descuenta deudas pendientes
deudas.spec.ts:672             cierre de embarque retorna deficitCaja en conciliacion
deudas.spec.ts:731             cierre con cuadre perfecto retorna deficitCaja = 0
```
</details>

<details>
<summary>Shard 2 (chromium) — 13 failed (+2 flaky)</summary>

```
embarques-all-contexts.spec.ts:279   crear stock estimado via modal
embarques-all-contexts.spec.ts:316   stock estimado con botellon aparece en GET
embarques-fixes.spec.ts:27           cerrar con discrepancia mixta crea descuento con precios correctos
embarques-hydration.spec.ts:27       embarques de fechas pasadas no desaparecen tras hidratación
entrega-gps.spec.ts:19               captura de GPS aparece en venta libre con geolocalización simulada
flujo-embarque-despachado-mobile.spec.ts:20   PUT a embarque CERRADO es rechazado
full-user-day.spec.ts:628            20. Asistente no ve boton Cerrar Dia
gastos.spec.ts:81                     validacion: sin categoria
insumos.spec.ts:51                    crear con proveedor
mobile-clientes.spec.ts:52            click en cliente abre el modal de detalle
mobile-clientes.spec.ts:79            modal de detalle muestra informacion del cliente (no error)
mobile-menu.spec.ts:78               hamburguesa toggle: abrir y cerrar con el mismo boton
mobile-offline-comprehensive.spec.ts:289   M5: Repartidor entrega pedido offline → sync → ENTREGADO
facturas.spec.ts:14 (flaky)          page loads
menu-reorder.spec.ts:101 (flaky)    botón Restablecer vuelve al orden por defecto
```
</details>

<details>
<summary>Shard 3 (chromium) — 12 failed</summary>

```
negocios-crud.spec.ts:193       link "Ver pedidos" navega a pedidos filtrados sin abrir formulario
nomina.spec.ts:20               crear nomina con calculo automatico
notificaciones/opt-in-toast.spec.ts:22/27/32/38/46   (5 tests del toast de opt-in push)
pedidos-all-contexts.spec.ts:971   tab Pedidos muestra filtros y Fiados NO los muestra
pedidos.spec.ts:217             ?atrasados=true abre vista autocontenida sin caer a Turno
productos-comprehensive.spec.ts:41   ASISTENTE puede ver productos pero NO editar via API
productos-comprehensive.spec.ts:340  discrepancy warning aparece cuando precioBase difiere >30%
productos-comprehensive.spec.ts:398  crear tier sin cantMax (sin limite)
```
</details>

<details>
<summary>Shard 4 (chromium) — 2 failed (+1 flaky)</summary>

```
proveedores.spec.ts:80          editar proveedor
user-flow.spec.ts:52            No hay errores de hydration ni consola en flujo principal
session-expiry.spec.ts:24 (flaky)   auth:expired event redirects to login with expired banner
```
</details>

<details>
<summary>Shard 5 (chromium-mobile) — 13 failed — mismos specs que shard 1 + cierre/dos-ventas</summary>

```
auth-endpoints.spec.ts:62, ciclo-cancelacion.spec.ts:12, ciclo-credito.spec.ts:12,
cierre.spec.ts:20 (page loads), compras.spec.ts:66,
critical-flows.spec.ts:90/174, deudas.spec.ts:386/451/490/672/731,
dos-ventas-rapidas-mismo-cliente.spec.ts:7
```
</details>

<details>
<summary>Shard 6 (chromium-mobile) — 21 failed (+2 flaky) — incluye el bug de fab-main ×7</summary>

```
embarques-all-contexts.spec.ts:273/279/299/316   (Stock Estimado UI)
embarques-dedicado.spec.ts:7/88/118              (Detail Page Actions)
embarques-fixes.spec.ts:27/825
embarques-hydration.spec.ts:27
entrega-gps.spec.ts:19
fiado-status-ui.spec.ts:34/52
flujo-embarque-despachado-mobile.spec.ts:20
full-user-day.spec.ts:628
gastos.spec.ts:81
insumos.spec.ts:51
menu-reorder.spec.ts:35/101
mobile-clientes.spec.ts:52/79
mobile-menu.spec.ts:78
mobile-offline-comprehensive.spec.ts:289
```
</details>

<details>
<summary>Shard 7 (chromium-mobile) — 10 failed — 48 did not run</summary>

```
negocios-crud.spec.ts:20        crear negocio desde detalle de cliente
nomina.spec.ts:20               crear nomina con calculo automatico
pedidos-all-contexts.spec.ts:811   badge de severidad se renderiza con colores correctos
pedidos-all-contexts.spec.ts:971   tab Pedidos muestra filtros y Fiados NO los muestra
pedidos-detalle-nombre.spec.ts:7   abrir detalle de pedido muestra el nombre del cliente
pedidos.spec.ts:217             ?atrasados=true abre vista autocontenida sin caer a Turno
produccion.spec.ts:26           carga inicial con stepper y stock
productos-comprehensive.spec.ts:41/340/398
```
</details>

<details>
<summary>Shard 8 (chromium-mobile) — 2 failed (+2 flaky)</summary>

```
proveedores.spec.ts:80          editar proveedor
user-flow.spec.ts:52            No hay errores de hydration ni consola en flujo principal
qa/07-offline-sync/dlq-4xx.spec.ts:13 (flaky)   4xx mueve pedido a DLQ y muestra badge
session-expiry.spec.ts:24 (flaky)   auth:expired event redirects to login with expired banner
```
</details>

---

## 5. Observaciones para la Fase 1 (instrumentación) y Fase 2 (matriz)

1. **`DB_TIMEOUT` solo aparece en 2 de 8 shards**, pero la cascada de integridad de datos (§3.3) aparece en más. Hay que confirmar en Fase 1 si el `DB_TIMEOUT` es la única manifestación del lock-contention o si hay timeouts silenciosos (sin `unhandledRejection`) en los demás shards.
2. **`prisma/reset-locked.ts` corre `clean.ts` con `stdio: 'ignore'`** → el `'inherit'` de `fixtures.ts` no sirve de nada. Es el primer fix de la Fase 1 (una línea) y es lo que destraba saber si el retry de `lock_timeout` se dispara.
3. **Al menos 3 causas raíz distintas coexisten:**
   - (a) DB lifecycle / lock-contention (§3.1–3.3) — la más extendida.
   - (b) Contratos de API desalineados (§3.4) — `Transicion invalida ABIERTO→CERRADO`, `TypeError: c is not iterable`, `toHaveProperty('notaCredito')`.
   - (c) Selector `fab-main` duplicado en mobile (§3.5) — solo proyecto `chromium-mobile`.
4. **`test.describe.configure({ mode: 'serial' })` amplifica cada fallo** en "N did not run". Reduce la señal (1 bug real → 5-10 tests rojos). Al migrar en Fase 3 hay que revisar si el `serial` sigue justificándose por test una vez que los datos estén aislados.
5. **El ruido `"Sesión invalidada"` (20-36×/shard) es sistémico** y viene de truncar `SesionActiva` en cada `beforeAll`. Debe ir a **0** tras la Fase 3.

---

## 5bis. Resultado de la Fase 1 (run `33307271423`) — resumen

- **`unhandledRejection: DB_TIMEOUT` → 0** (era 2 en shards 1 y 5). Fix `fc949e6`. ✅
- **Lock-contention del `TRUNCATE`: 0 ocurrencias** en los 8 shards. La hipótesis H1 del plan **queda refutada** para el estado actual de CI. Detalle en `failure-matrix.md` §0.
- La instrumentación de la Fase 1 (`stdio: 'inherit'`) causó una regresión en shard 6 (+14 fallos por flood de stdout). Revertida en `a9e72020`. Ver `failure-matrix.md` §5.
- Ver **`failure-matrix.md`** para la clasificación causal completa (Fase 2).

## 6. Estado previo ya documentado (no re-derivar)

`AGENTS.md` Known Issues **#20** (E2E auth flakiness / DB-reset race / lock-contention — ~6 iteraciones de forense), **#24** (vistas mobile/desktop duplicadas), **#25** (job E2E reactivado, causa de capacidad no confirmada), **#26** (bucle de requests en `/pedidos`). Este baseline **confirma** que el mecanismo de #20 (lock-contention del `TRUNCATE` + `DB_TIMEOUT` + cascada) sigue vivo en `origin/main` al 2026-08-30.
