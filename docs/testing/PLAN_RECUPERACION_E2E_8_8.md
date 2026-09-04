# Plan de Recuperación E2E 8/8 — Agua Bambú

**Autor:** Ingeniería
**Fecha:** 2026-08-30
**Estado:** BORRADOR — pendiente de aprobación (Ronda 2 del protocolo, `AGENTS.md`)
**Objetivo:** llevar la suite E2E a 8/8 shards PASS de forma **determinista, aislada, reproducible y diagnosticable**, sin modificar producto para poner verde.

Este plan fusiona el documento `Plan_Tecnico_Recuperacion_E2E_Agua_Bambu.docx` (aportado por el PO) con:
- la evidencia forense ya acumulada en `AGENTS.md` Known Issues #20–#26,
- la práctica de campo contrastada contra docs oficiales de Playwright, Prisma y Node.js (ver §11 Fuentes).

---

## 0. Estado observado (evidencia, no diagnóstico)

| Campo | Valor |
|---|---|
| Run de CI de referencia | `33289190333` (workflow CI, push a `main`) |
| Commit | `5380d26d16f89932101e66b603a002c374572cfe` — "fix(dashboard): fecha en TZ Bogotá + canal en Ventas por Precio (#139)" |
| Fecha | 2026-08-30 ~03:00 UTC |
| Resultado | **8/8 shards FAIL** |
| Shard 1 | 208 tests → 179 passed, **11 failed, 12 did not run** (13.1 min) |
| Firma | 2× `[WebServer] ⨯ unhandledRejection: Error: DB_TIMEOUT` a los ~4 min del run |
| Ruido de fondo | `[WebServer] "Sesión invalidada: no existe o expiró"` cada ~8 s durante todo el run, desde el minuto 1 |
| Specs que cascadean (shard 1) | `auth-endpoints`, `ciclo-cancelacion`, `ciclo-credito`, `compras`, `critical-flows`, `deudas` — errores de **integridad de datos**, no de UI/timing |

Config actual relevante:
- `playwright.config.ts`: `workers: CI ? 1 : 1`, `retries: CI ? 2 : 0`, `reporter: 'html'`, webServer = `node .next/standalone/server.js` (build de prod).
- `e2e/fixtures.ts:46,55`: `resetTestDatabase()` / `resetDatabase()` → `npx tsx prisma/reset-locked.ts` con `stdio: 'inherit'` (diagnóstico temporal).
- `prisma/reset-locked.ts:30-31`: invoca `clean.ts` y el seed con **`stdio: 'ignore'`** → **anula** el `'inherit'` de fixtures.ts. El output de `clean.ts` no llega a CI.
- `prisma/clean.ts`: `TRUNCATE ... CASCADE` sobre 39 tablas (incluida `SesionActiva`), con `SET LOCAL lock_timeout='3000ms'` + retry ×4.
- **42 de 81 specs** llaman `resetTestDatabase()` / `resetDatabase()` en `test.beforeAll`. 45 usan `test.describe.configure({ mode: 'serial' })`.
- Cada shard de CI levanta su **propio** contenedor Postgres + Redis (`ci.yml`). No hay estado compartido entre shards.

---

## 1. Diagnóstico causal (hipótesis a confirmar en Fase 2)

Ordenadas por confianza. Ninguna se da por cerrada hasta la Fase 2.

### H1 — Reset agresivo de DB compartida durante el run (ALTA confianza)
`TRUNCATE ... CASCADE` requiere lock `ACCESS EXCLUSIVE`. Si un spec anterior dejó una request en vuelo (`POST /api/clientes`, transacción Serializable) cuando el siguiente `beforeAll` dispara el reset, el TRUNCATE y la transacción se bloquean mutuamente. El `Promise.race` de 25 s en `src/app/api/clientes/route.ts` vence → `Error: DB_TIMEOUT`. La promesa perdedora del race no tiene `.catch()` → `unhandledRejection`. Además, truncar `SesionActiva` invalida la sesión que el server tenía cacheada → `"Sesión invalidada"` + 401 en specs de otros bloques.
**Fuente de campo:** Playwright issue #33699 (sin solución oficial), Prisma integration-testing doc (`jest -i`, serial), Playwright global-setup doc ("clearing a shared DB → Race Condition"). Todas desaconsejan exactamente este patrón.

### H2 — `unhandledRejection` de la app (ALTA confianza, bug real de producto de test-infra)
`Promise.race([work, timeout])` sin `.catch()` en la rama perdedora es un `unhandledRejection` garantizado cuando `work` rechaza después del timeout. Node 22 default (`--unhandled-rejections=throw`) lo eleva a excepción; Next.js registra un handler que lo loguea (`⨯`), así que el server *probablemente* sobrevive, pero Playwright puede abortar el run igual si detecta inestabilidad del webServer → cola de "did not run".

### H3 — E2E desalineados con contratos de API/UI vigentes (MEDIA confianza)
Parte de los 11 fallos por shard pueden ser expectativas obsoletas (envelope de respuesta, shape de error, selectores frágiles) **independientes** de H1/H2. Hay que separarlos en la matriz.

### H4 — Límite de recursos del runner (BAJA confianza, no descartada)
`ubuntu-latest` = 2 vCPU / 7 GB corriendo Postgres + Redis + Next standalone + Chromium. `AGENTS.md` #25 la dejó "no confirmada". Se re-evalúa solo si H1–H3 no explican los 8 shards.

### No-causa
El sharding de 8 jobs **no** es causa raíz: cada shard está aislado (contenedor propio). "Los 8 fallan" ⇒ bug determinista por-spec (H1/H2/H3), no concurrencia entre shards.

---

## 2. Estrategia de solución

**Principio rector (del doc del PO):** primero demostrar la causa → después modificar → después verificar aislamiento → después aumentar paralelismo.

**Decisión de arquitectura (ajuste al doc del PO):** el doc prioriza "DB aislada por shard/worker" (item 9). La práctica de campo (§11) muestra que el aislamiento de infra (schema/DB por worker) es la opción **pesada y frágil** en este stack — colisiona con `pg_advisory_lock` (global al cluster, no al schema; `src/lib/locks.ts`, `src/lib/sequence.ts`) y con `pg_trgm`. El patrón que la comunidad sostiene con éxito es:

> **Sembrar el estado compartido UNA vez (global setup) + cada test crea sus entidades namespaced + cleanup por ID exacto + `serial` para los pocos tests que mutan estado global. Cero `TRUNCATE` durante el run.**

Esto ataca H1 y H2 de raíz (no hay TRUNCATE que contienda, no se trunca `SesionActiva`). El aislamiento por worker queda como trabajo **opcional posterior**, solo si se decide subir `workers > 1`.

---

## 3. Fases y checkpoints

Cada fase termina en un **checkpoint** con criterio de salida verificable. No se avanza sin cumplirlo. Cada cambio de código va en **commit pequeño y reversible** con el formato del doc del PO (`test(e2e): ...`).

### FASE 0 — Congelamiento (sin cambios de código)

| # | Acción |
|---|---|
| 0.1 | `git fetch origin`; fijar el commit baseline = HEAD de `origin/main`. Registrar SHA, run de CI, fecha. |
| 0.2 | No tocar timeouts, retries, workers, skips, assertions, lógica de negocio, Prisma, API ni infra. |
| 0.3 | Descargar los 8 reportes/logs del run de referencia (`gh api repos/casasleonj/bambu/actions/jobs/<id>/logs`). Archivar en `e2e/docs/_evidence/`. |

**Entregable:** `e2e/docs/baseline.md` — SHA, run, nº de shards, tests ejecutados, pass/fail/skipped por shard, timeouts, errores DB/API/UI, duración. Cita `AGENTS.md` #20–#26 como estado previo (no re-derivar).

**Checkpoint 0 (Gate — Freeze):**
- [ ] `e2e/docs/baseline.md` existe y es reproducible (cualquiera puede bajar los mismos logs y llegar a los mismos números).
- [ ] Working tree limpio. Ningún cambio de comportamiento en este rango de commits.
- [ ] Aprobación explícita del PO para pasar a Fase 1.

---

### FASE 1 — Instrumentación mínima del diagnóstico (cambios quirúrgicos, reversibles)

Objetivo: **ver** qué pasa, sin cambiar comportamiento de tests.

| # | Acción | Archivo |
|---|---|---|
| 1.1 | Propagar `stdio` de `clean.ts` y del seed hasta CI (hoy `reset-locked.ts` los corre con `'ignore'`, anulando el `'inherit'` de `fixtures.ts`). | `prisma/reset-locked.ts:30-31` |
| 1.2 | Instrumentación temporal de conexiones Postgres: log de `pid, datname, application_name, state, query, query_start, xact_start, wait_event, wait_event_type` al inicio de cada `clean()` y ante cada retry de `lock_timeout`. | `prisma/clean.ts` |
| 1.3 | Confirmar/añadir handler de `unhandledRejection` en el server standalone que **loguee el stack completo** (no solo el mensaje) para localizar el origen exacto del `DB_TIMEOUT`. | server bootstrap / `instrumentation.ts` |
| 1.4 | Disparar 1 run de CI (`workflow_dispatch`) sobre el commit baseline + esta instrumentación. |

**Entregable:** `e2e/docs/database-isolation.md` (sección 1: "qué observamos") + `e2e/docs/architecture.md` (quién crea/modifica/destruye cada recurso, qué estado es compartido vs aislado).

**Checkpoint 1 (Gate — Diagnóstico):**
- [ ] El run de CI muestra el output de `clean.ts` (incl. `Cleaned X` / `Lock contention on X, retrying...`).
- [ ] Sabemos: (a) si el retry de `lock_timeout` se dispara y cuántas veces; (b) qué transacción/PID retiene el lock cuando ocurre el `DB_TIMEOUT`; (c) el stack exacto del `unhandledRejection`.
- [ ] H1 y H2 quedan **confirmadas o refutadas** con evidencia. Si se refutan → volver a §1 con la nueva evidencia como input (Ronda 1 del protocolo).
- [ ] Aprobación del PO para pasar a Fase 2.

**Rollback:** revertir 1.1–1.3 es un `git revert` de 1 commit. La instrumentación 1.2 se quita en Fase 5.

---

### FASE 2 — Matriz de fallos y clasificación causal (sin cambios de código)

| # | Acción |
|---|---|
| 2.1 | Para cada shard: tabla `shard / test / error / dependencia / clasificación`. |
| 2.2 | Clasificar cada failure: `PRODUCT_CONTRACT`, `E2E_OUTDATED`, `UI_STATE`, `FIXTURE`, `SELECTOR`, `DATABASE_ISOLATION`, `DATABASE_LIFECYCLE`, `AUTH_SESSION`, `INFRASTRUCTURE`, `TRUE_FLAKY`. |
| 2.3 | Regla `TRUE_FLAKY`: no se declara con 1 fallo. Repetir mismo commit/input/datos/shard/entorno. Objetivo: 20 repeticiones locales del spec sospechoso (`--repeat-each=20`). Separar fallo determinista de no-determinismo real. |
| 2.4 | Hipótesis a validar: la mayoría de los 11 fallos/shard son **una** causa raíz (`DATABASE_LIFECYCLE`), no 11 bugs. |

**Entregable:** `e2e/docs/failure-matrix.md`.

**Checkpoint 2 (Gate — Clasificación):**
- [ ] Todo failure del run baseline tiene una clasificación con justificación (no "parece flaky").
- [ ] Los `TRUE_FLAKY` (si hay) tienen evidencia de no-determinismo real (N repeticiones, X fallos aleatorios).
- [ ] Lista priorizada de causas raíz con nº de tests que resuelve cada una.
- [ ] Aprobación del PO del alcance de Fase 3.

---

### FASE 3 — Aislamiento de datos (patrón A: namespaced + sin reset)

El cambio de mayor palanca. Se hace **incremental, spec por spec**, cada uno en su commit.

| # | Acción | Archivo(s) |
|---|---|---|
| 3.1 | Documentar qué resolvió históricamente `reset-locked.ts` / `clean.ts` (advisory lock, corrupción cruzada de resets), qué conexiones termina, cuándo corre, qué riesgos introduce. **Antes** de modificarlo. | `e2e/docs/database-isolation.md` §2 |
| 3.2 | `global-setup` de Playwright: sembrar **una vez** el estado compartido read-only (`Config`, precios, productos, usuarios de rol, `CONSUMIDOR_FINAL`). Idempotente. | `playwright.config.ts`, `e2e/global-setup.ts` (nuevo) |
| 3.3 | Fixture `namespace` con `scope: 'worker'`: prefijo `e2e-<runId>-<workerIndex>-<uuid>` para toda entidad creada por un test. | `e2e/fixtures.ts` |
| 3.4 | Migrar los 42 specs con `resetTestDatabase()`: (a) quitar la llamada al reset; (b) cada test crea sus entidades vía API con nombre namespaced; (c) guardar los IDs creados; (d) cleanup `afterEach`/`afterAll` por ID exacto (stack LIFO); (e) tratar estado compartido como read-only. Orden sugerido: `clientes.spec.ts` (10 resets) → `deudas.spec.ts` + `ciclo-*.spec.ts` + `critical-flows.spec.ts` (los que cascadean en shard 1) → el resto. | `e2e/*.spec.ts` |
| 3.5 | Los tests que **necesitan** mutar estado global compartido (ej. `Config`, `session-limits`): `test.describe.configure({ mode: 'serial' })` + restaurar el valor en `afterAll`. | specs afectados |
| 3.6 | Validar invariantes del estado inicial antes de ejecutar el comportamiento objetivo (assert de precondición explícito). | specs migrados |
| 3.7 | Regla nueva: **no usar la UI para construir precondiciones**. Estado por API/fixture; UI solo para probar comportamiento de UI. | specs migrados |

**Entregable:** `e2e/docs/fixture-contract.md` — contrato de fixtures (crean estado de negocio válido, no filas sueltas; sin dependencia de orden, IDs incrementales ni aleatoriedad no controlada; IDs guardados y usados).

**Checkpoint 3 (Gate — Aislamiento):**
- [ ] Ningún spec migrado llama `TRUNCATE` / `resetTestDatabase()` / `resetDatabase()` en su ciclo de vida.
- [ ] Run de CI: **0 ocurrencias** de `"Sesión invalidada: no existe o expiró"` durante el run.
- [ ] Run de CI: **0 ocurrencias** de `unhandledRejection: Error: DB_TIMEOUT`.
- [ ] Sin contaminación entre tests/shards: correr 2 specs migrados en el mismo shard, en ambos órdenes, mismo resultado.
- [ ] Nº de fallos por shard baja respecto al baseline (magnitud a confirmar según matriz Fase 2).
- [ ] Aprobación del PO.

**Rollback:** cada spec migrado es un commit independiente reversible. `global-setup.ts` y el fixture `namespace` son additivos.

---

### FASE 4 — Contratos de API y expectativas centralizadas

Solo sobre lo que siga rojo después de Fase 3.

| # | Acción | Archivo(s) |
|---|---|---|
| 4.1 | Por endpoint en fallo: determinar el **contrato vigente**. Comparar `route → use case → response helper → JSON real → expectativa E2E`. | — |
| 4.2 | Si la app cumple el contrato correcto y el E2E está obsoleto → actualizar **el E2E**. | `e2e/*.spec.ts` |
| 4.3 | Si el contrato vigente es incorrecto respecto al producto → **registrar brecha PLAN ↔ CÓDIGO**, no tocar. Escalar al PO. **Prohibido modificar producto para poner verde** (`AGENTS.md` #19). | `e2e/docs/api-contract.md` |
| 4.4 | Si existe un response envelope estándar → helpers de test consistentes para éxito/error. Evitar que cada spec interprete distinto la misma respuesta. Prohibido: assertions tolerantes que oculten estructuras incompatibles. | `e2e/fixtures.ts` o `e2e/helpers/api.ts` (nuevo) |
| 4.5 | Casos abonos/fiados: **recuperar primero** las decisiones vigentes de `plan-maestro-v11.1-equipo-desarrollo.md` y `plan-maestro-embarques-autocontenido-equipo-desarrollo.md`. No inventar reglas donde no hay decisión. Luego matriz: abono exacto / parcial / mayor / equivocado / reversión / doble reversión / inexistente / concurrencia / refresh / fallo de red. | `e2e/docs/api-contract.md` |

**Entregable:** `e2e/docs/api-contract.md` — contrato vigente por endpoint tocado + lista de brechas PLAN ↔ CÓDIGO.

**Checkpoint 4 (Gate — Contratos):**
- [ ] Cada E2E modificado está alineado con el contrato **vigente** de la app (no con un contrato inventado para pasar).
- [ ] Toda brecha "el producto debería cambiar" está registrada y escalada, no parcheada en el test.
- [ ] Helpers de envelope en uso donde aplica; sin assertions tolerantes nuevas.
- [ ] Aprobación del PO de las brechas registradas.

---

### FASE 5 — Limpieza de instrumentación + observabilidad permanente

| # | Acción | Archivo(s) |
|---|---|---|
| 5.1 | Quitar instrumentación temporal de Fase 1 (1.2). Revertir `stdio` a `'ignore'` **solo si** ya no aporta señal; si aporta, dejarlo. | `prisma/clean.ts`, `prisma/reset-locked.ts` |
| 5.2 | `reporter: process.env.CI ? 'blob' : 'html'` + job `merge-reports` en `ci.yml` con `if: always()` en los uploads. Un reporte unificado de los 8 shards. | `playwright.config.ts`, `.github/workflows/ci.yml` |
| 5.3 | Conservar en failures: HTML report, trace, screenshots, logs de server/DB. Añadir info de network/DB cuando sea necesaria para reconstruir la causa sin reproducir el escenario a mano. | `ci.yml` |
| 5.4 | `pg_terminate_backend` (si se usa en algún script): dejarlo como mecanismo **excepcional y logueado**, no como cleanup normal. | scripts de reset |

**Entregable:** `e2e/docs/architecture.md` actualizado (sección observabilidad).

**Checkpoint 5 (Gate — Diagnosticabilidad):**
- [ ] Un failure de CI se puede diagnosticar desde los artifacts, sin re-ejecutar el escenario localmente.
- [ ] Reporte único de shards (blob + merge) funcionando.
- [ ] Sin instrumentación ruidosa permanente que no aporte señal.

---

### FASE 6 — Escalamiento de paralelismo (opcional, solo si se decide `workers > 1`)

| # | Acción |
|---|---|
| 6.1 | Validar en este orden: `workers=1` PASS → `2` → `4`. (Los **shards** ya están aislados; la perilla es `workers` dentro del shard.) |
| 6.2 | Si `1/2/4` pasan pero un nº mayor falla → investigar concurrencia / aislamiento / recursos, **no** volver a tocar los tests funcionales. |
| 6.3 | Si se necesita aislamiento de infra: schema-per-worker keyed por `TEST_WORKER_INDEX` (`?schema=` en `DATABASE_URL`). **Requiere** namespacear la key de `pg_advisory_lock` por worker (`src/lib/locks.ts`, `src/lib/sequence.ts`) — es global al cluster, no al schema. Verificar `pg_trgm` por schema. |
| 6.4 | Documentar en `AGENTS.md` #20 el resultado (cierra el hilo "DB-per-worker isolation es el prerequisito"). |

**Checkpoint 6 (Gate — Paralelismo):**
- [ ] `workers=N` objetivo PASS en 5 runs de CI consecutivos sin flaky.
- [ ] `pg_advisory_lock` verificado sin colisión entre workers.

---

### FASE 7 — Repetibilidad y criterio de cierre

| # | Acción |
|---|---|
| 7.1 | Sobre el commit estable: **retries en 0** para detectar inestabilidad real. |
| 7.2 | CI: 5 runs × 8 shards consecutivos sin fallo inesperado. (El doc del PO pide 20×8=160; se escala a 5×8 en CI + 20× local con `--repeat-each` sobre los specs históricamente inestables — 160 runs de CI ≈ 48 h de runner por iteración, desproporcionado para 6 usuarios. Ajuste a validar con el PO.) |
| 7.3 | `retries` vuelve a `2` en CI **después** de Gate A (los retries enmascaran flaky durante la validación). |

**Entregable:** `e2e/docs/verification-report.md` — evidencia de cada gate (output de runs, no afirmaciones).

**Checkpoint 7 (Gates finales):**
- [ ] **Gate A — Determinismo:** 5 runs CI + 20× local de specs sospechosos, sin fallo inesperado, `retries=0`.
- [ ] **Gate B — Paralelismo:** `workers` objetivo (1 si no se sube) PASS.
- [ ] **Gate C — Aislamiento:** sin contaminación entre tests/shards (verificado con reordenamiento).
- [ ] **Gate D — DB:** sin conexiones inesperadas tras teardown (query de `pg_stat_activity` al final del run).
- [ ] **Gate E — Contratos:** E2E alineados con contrato vigente; brechas registradas.
- [ ] **Gate F — Diagnóstico:** failures con evidencia suficiente para identificar causa.
- [ ] `npx tsc --noEmit` y `npm run test` (Vitest) sin regresión.

**La suite NO se considera reparada solo porque el pipeline esté verde.** Debe ser determinista, aislada, reproducible, diagnosticable y compatible con el contrato vigente.

---

## 4. Entregables (todos versionados en `e2e/docs/`)

| Archivo | Fase que lo produce |
|---|---|
| `e2e/docs/baseline.md` | 0 |
| `e2e/docs/architecture.md` | 1, 5 |
| `e2e/docs/database-isolation.md` | 1, 3 |
| `e2e/docs/failure-matrix.md` | 2 |
| `e2e/docs/fixture-contract.md` | 3 |
| `e2e/docs/api-contract.md` | 4 |
| `e2e/docs/verification-report.md` | 7 |

---

## 5. Reglas de trabajo (del doc del PO)

- **Un responsable de integración** del incidente E2E.
- Líneas de trabajo separadas: (a) API/E2E, (b) DB/lifecycle, (c) UI/fixtures.
- Cada cambio responde: **qué failure corrige · por qué esa es la causa · qué comportamiento podría romper · qué prueba evita la regresión**.
- Commits pequeños y reversibles: `test(e2e): align auth assertions with response envelope`, `test(e2e): make purchase fixture deterministic`, `test(e2e): isolate clientes spec from DB reset`.
- **Prohibido:** cadenas de fixes ambiguos, cambios simultáneos de producto + infra, modificar producto para poner verde.
- Si no hay fuente confiable para una decisión → `NO VERIFICADO — testear antes de usar`.

---

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| Migrar 42 specs es mucho trabajo → tentación de atajar con más timeouts/retries | Gate 3 prohíbe avanzar sin quitar el reset; retries a 0 en Gate A |
| `global-setup` idempotente rompe algún spec que asumía DB vacía | Migración incremental spec-por-spec, cada uno reversible |
| Quitar `resetDatabase()` deja datos de runs previos → falsos negativos | Prefijo `e2e-<runId>-*` + janitor de datos viejos; en CI el contenedor es efímero (no aplica) |
| H1/H2 se refutan en Fase 1 y la causa es H4 (recursos) | Fase 1 es barata y da la respuesta antes de tocar specs; si es H4, el plan pivota a infra del runner |
| `pg_advisory_lock` colisiona si se sube `workers` con schema-per-worker | Fase 6.3 explícita; no se sube `workers` sin resolverlo |
| Brechas PLAN ↔ CÓDIGO bloqueadas esperando decisión del PO | Se registran y se sigue con el resto; no frenan la fase |

---

## 7. Qué NO hace este plan

- No sube `workers` en CI salvo decisión explícita (Fase 6 opcional).
- No implementa DB-per-worker (queda como trabajo futuro condicionado a Fase 6).
- No refactoriza `fetch` directos a `fetchResilient` (fuera de alcance).
- No toca `src/proxy.ts`, rate limiting ni auth de producción.
- No modifica lógica de negocio salvo el `unhandledRejection` de `POST /api/clientes` (H2), que es un bug real y se trata como fix aparte con su propio test.

---

## 8. Orden de ejecución resumido

```
Fase 0  Freeze + baseline.md ........................ Gate Freeze
Fase 1  Instrumentar diagnóstico (1 run CI) ......... Gate Diagnóstico  → confirma/refuta H1,H2
Fase 2  failure-matrix.md + clasificación .......... Gate Clasificación
Fase 3  Aislamiento namespaced (42 specs, incremental) Gate Aislamiento  → 0 DB_TIMEOUT, 0 "Sesión invalidada"
Fase 4  Contratos de API sobre lo que siga rojo ..... Gate Contratos
Fase 5  Limpieza + blob reporter + merge-reports .... Gate Diagnosticabilidad
Fase 6  (opcional) workers 1→2→4 ................... Gate Paralelismo
Fase 7  5×8 runs CI + 20× local, retries=0 ......... Gates A–F + verification-report.md
```

---

## 9. Fuentes (Jerarquía del protocolo)

1. [Playwright — Parallelism / isolate test data between workers](https://playwright.dev/docs/test-parallel)
2. [Playwright — Sharding (blob reporter + merge-reports)](https://playwright.dev/docs/test-sharding)
3. [Playwright — Global setup and teardown](https://playwright.dev/docs/test-global-setup-teardown)
4. [Playwright issue #33699 — isolated tests against a real DB (sin solución oficial)](https://github.com/microsoft/playwright/issues/33699)
5. [Prisma Docs — Integration testing (`jest -i`, serial)](https://www.prisma.io/docs/orm/prisma-client/testing/integration-testing)
6. [Node.js PR #33021 — default `--unhandled-rejections=throw`](https://github.com/nodejs/node/pull/33021)
7. [stablyai/agent-skills — playwright-test-data-isolation (namespaced data + ID cleanup)](https://github.com/stablyai/agent-skills/tree/main/skills/playwright-test-data-isolation)
8. [jest schemas per worker](https://medium.com/@sebastinchikn/how-to-run-jest-integration-tests-in-parallel-using-isolated-sql-schemas-f4c5e534030a) · [quramy/jest-prisma (rollback)](https://github.com/neet/jest-prisma)
9. Evidencia interna: `AGENTS.md` Known Issues #20–#26, run CI `33289190333`.
