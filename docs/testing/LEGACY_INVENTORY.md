# LEGACY_INVENTORY.md

**Fecha del snapshot:** 2026-08-24 · Commit `4c6cba35`
**Fase:** 0 — Congelar la fotografía actual

Este documento registra **candidatos** encontrados durante Fase 0. Ninguno tiene decisión de eliminación tomada. Por la regla del plan de ataque (§21-22), un candidato solo puede eliminarse tras pasar los 6 Gates de seguridad (Producto / Técnico / Datos / Testing / CI / Rollback) — trabajo de Fases 1-11, no de esta fase.

Clasificación usada (plan §15, §3):

```
DEAD_CONFIRMED | LEGACY_ACTIVE | RUNTIME_INDIRECT | TEST_ONLY | BUILD_ONLY | SCRIPT_ONLY | GENERATED | CANDIDATE | UNKNOWN
```

---

## 1. `playwright.test.config.ts` — CANDIDATE (alto grado de confianza, sin confirmar)

| Campo | Valor |
|---|---|
| Ruta | `/playwright.test.config.ts` (raíz del repo) |
| Contenido | Config Playwright casi idéntica a `playwright.config.ts`, pero con `workers: 4`, `retries: 0`, `reporter: 'line'`, un solo project (`chromium`), sin `testIgnore`, sin `webServer` (asume server ya corriendo). |
| Origen (git log) | Un único commit: `2ce2c75b fix(e2e): update cierre API tests for new strict CierreCreateSchema` — el mensaje del commit no describe la creación de un config nuevo; sugiere que el archivo fue un subproducto de esa sesión de trabajo (posible config local de un desarrollador para correr con más workers, commiteado por accidente). |
| Referencias | **0** — no aparece en `package.json` (ningún script `--config playwright.test.config.ts`), no aparece en `.github/workflows/*`, no aparece en AGENTS.md ni en el plan de auditoría. |
| Evidencia de uso indirecto | Ninguna encontrada en esta fase. No se buscó en scripts locales fuera de git (`.bash_history`, etc. — fuera de alcance). |
| Gates (preliminar, NO concluyente) | Producto: N/A (es infraestructura de test). Técnico: sin ruta de uso encontrada. Datos: N/A. Testing: no aporta cobertura que `playwright.config.ts` no tenga (mismo `testDir`). CI: no depende de él. Rollback: trivial (un archivo). |
| **Riesgo de eliminación** | Bajo, **pero no confirmado** — falta el paso explícito del plan (§15): confirmar que ningún desarrollador lo usa localmente vía `npx playwright test --config=playwright.test.config.ts` a mano. Es el tipo de archivo que un `grep` no puede descartar del todo (invocación manual por CLI no deja rastro en el repo). |
| Próximo paso (Fase 1/10, no ejecutado aquí) | Preguntar al equipo si alguien lo usa manualmente antes de proponer PR de eliminación. Si nadie lo reclama en un ciclo, es `DEAD_CONFIRMED`. |

## 2. `prisma/__tests__/*.test.ts` — UNKNOWN (huérfano de ejecución, no de código)

| Campo | Valor |
|---|---|
| Archivos | `check-constraints.test.ts`, `check-constraints-runtime.test.ts`, `factura-numero-seq.test.ts`, `seed.test.ts` |
| Exclusión confirmada | `vitest.config.ts` los excluye explícitamente (`exclude: [..., 'prisma/__tests__/**']`). `vitest.integration.config.ts` no los incluye (`include` está limitado a `src/lib/__tests__/integration/**/*.test.ts`). **Resultado: ningún comando de `package.json` los ejecuta, y no corren en ningún job de CI.** |
| Por qué NO es `DEAD_CONFIRMED` todavía | El código sigue siendo válido TypeScript, referencia funciones reales del proyecto (a diferenciar de código realmente muerto). El patrón de nombres (`check-constraints`, `factura-numero-seq`) sugiere que fueron escritos como parte de trabajo real de constraints/secuencias documentado en AGENTS.md (ledgers físicos, `20260817_plan_maestro_ledgers`, `getNextNumero()`) — es plausible que hayan sido la prueba manual que acompañó ese trabajo y luego quedaron sin engancharse a ningún config, no que sean descartables. |
| Historial (git log) | Creados/tocados en 5 commits distintos entre `65a7a854` (feat inicial de auditoría de calidad) y `32c86838` (`chore(lint)... desactiva E2E temporalmente`, #78) — el último tocado en el mismo commit que desactivó E2E, lo que sugiere que pudo perder su enganche a CI en esa limpieza sin que fuera intencional. |
| Riesgo de "falso positivo" (plan §20, Caso C) | **Alto** si se asume que "están cubiertos en otro lado" sin verificar — nombran específicamente CHECK constraints (`chk_embarque_movimiento_*`, `chk_obligacion_*`, `chk_recovery_*`) y secuencias atómicas que, según el propio `.github/workflows/ci.yml`, se aplican vía SQL crudo fuera de `schema.prisma` — exactamente el tipo de comportamiento que un test de integración normal (contra `db push`) no cubriría si no corre explícitamente después de aplicar esas migraciones raw-SQL. |
| **Riesgo de eliminación** | **No evaluable en Fase 0.** Antes de decidir nada, hay que: (1) confirmar si corren manualmente y pasan contra una DB real con las migraciones raw-SQL aplicadas, (2) determinar si `check-constraints-runtime.test.ts`/`factura-numero-seq.test.ts` cubren algo que `prisma/__tests__/…` en la sección de CI (`Apply raw-SQL sequence migrations`) no verifica de otra forma. |
| Próximo paso (Fase 3/4, no ejecutado aquí) | Correr los 4 archivos manualmente (`npx vitest run prisma/__tests__ --config vitest.integration.config.ts` tras ajustar `include`, o un config dedicado) contra Postgres real con las migraciones raw-SQL de `ci.yml` aplicadas, y ver si pasan. Si pasan y protegen comportamiento no cubierto en otro lado → **enganchar a CI** (no eliminar). Si están rotos/obsoletos → recién ahí evaluar eliminación con evidencia. |

## 3. `syncQueue` (Dexie legacy) — LEGACY_ACTIVE (ya documentado, confirmado en este snapshot)

| Campo | Valor |
|---|---|
| Estado | Confirmado **activo**, no candidato a limpieza en esta ronda. |
| Escritores/lectores | `src/lib/db/sync.ts`, `src/lib/db/offline.ts`, `src/components/connectivity-indicator.tsx` — todos referencian `syncQueue` junto con `requestQueue` (arquitectura nueva). |
| Tests | `src/lib/db/__tests__/sync-offline.test.ts` cubre ambos mecanismos. |
| Por qué se registra igual | El plan (§14) exige el checklist completo (escritores, lectores, migraciones, recuperación, tests, versiones de cliente, datos persistidos) antes de decidir sobre estructuras legacy de datos — este snapshot solo confirma escritores/lectores/tests; **faltan** los puntos de "datos persistidos en producción" y "compatibilidad con clientes offline viejos" (requiere acceso a IndexedDB de usuarios reales o telemetría, fuera de alcance de este repo). |
| **Riesgo de eliminación** | No evaluable sin la fase dedicada (§14, explícitamente "para una fase posterior y separada" según el propio plan, §29). |

## 4. Drift de versiones pinneadas (no es legacy de test/código, pero es evidencia de Fase 0 con valor de auditoría)

| Paquete | package.json | AGENTS.md dice | Estado |
|---|---|---|---|
| `serwist`, `@serwist/next`, `@serwist/turbopack` | `^9.5.12` | "Serwist 9.5.7" pinneado | Documentación desactualizada **y** regla de pinning violada simultáneamente. |
| `@vitest/coverage-v8` | `^3.2.4` | No mencionado | Regla de pinning violada; no documentado en absoluto. |

No es un hallazgo de "test/código legacy" en el sentido del plan de ataque, pero se registra porque el plan pide contrastar toda afirmación verificable contra el estado real (§29) y este hallazgo apareció como efecto colateral de verificar versiones para el baseline. **No se corrige en esta fase** — sería mezclar saneamiento con una fase que debe ser solo fotografía (regla §4.2 del plan).

## 5. Suites `e2e/qa` vs `e2e/qa-comprehensive` vs `e2e/exploratory` vs `e2e/produccion` — UNKNOWN (taxonomía, no legacy)

No se clasifican todavía como legacy/activo/duplicado — eso es explícitamente el trabajo de las Fases 1, 3, 5 y 6 del plan (inventario, fixtures, calidad semántica, duplicación), que no corresponden a Fase 0. Se listan aquí únicamente como recordatorio de alcance pendiente, con los conteos ya medidos en `TEST_INVENTORY.md`:

- `e2e/qa/` — 17 archivos, **incluido en CI**.
- `e2e/qa-comprehensive/` — 66 archivos, excluido de CI por `testIgnore`.
- `e2e/exploratory/` — 13 archivos, excluido de CI por `testIgnore`.
- `e2e/produccion/` — 3 archivos, excluido de CI por `testIgnore`.

## 6. Fallo de los 8 shards de E2E en el run más reciente — no es "legacy", pero bloquea el uso de CI como señal de verificación

Ver `TESTING_BASELINE.md` §7. Se registra aquí como recordatorio de que **cualquier PR de saneamiento futuro no podrá confiar en el job `e2e` como gate confiable hasta que esto se investigue** — el propio plan (§25, paso 12 "Primeros PRs de bajo riesgo") asume implícitamente una CI que puede confirmar ausencia de regresión; ahora mismo esa señal está degradada para E2E específicamente (unit tests, integration y lint sí están verdes).

### 6.1 Actualización (2026-08-24, esta sesión) — evidencia directa de logs, corrige AGENTS.md Known Issue #20

Se descargaron los logs completos de los 8 jobs `E2E (N/8)` del run `32683746373` (commit `b3162bbf`, el fix de `lock_timeout`+retry en `clean.ts`) vía `gh api repos/casasleonj/bambu/actions/jobs/<id>/logs`. Hallazgos:

- **Los 8 shards fallan simultáneamente**, no solo shard 1: entre 8 y 21 tests fallidos por shard (rango de pass rate ~83%-95%), sobre familias de specs completamente distintas por shard (shard 1: `auth-endpoints`/`ciclo-cancelacion`/`ciclo-credito`/`compras`/`critical-flows`/`deudas`; shard 2: `negocios-crud`/`nomina`/`pedidos-all-contexts`/`productos-comprehensive`; shard 4: `embarques-*`/`gastos`/`insumos`/`mobile-*`; etc. — ver detalle completo en el propio log si se necesita). **Esto contradice la caracterización de AGENTS.md Known Issue #20** ("el shard 1... falla de forma determinística... sin necesidad de workers>1"), que fue escrita observando repetidamente el mismo shard. La evidencia de este run indica que el problema es generalizado a los 8 shards, no confinado a uno.
- Cada shard de la matriz de GitHub Actions levanta **su propio** contenedor Docker de Postgres/Redis (paso "Start service containers" dentro de cada job) — están completamente aislados entre sí. Por lo tanto el mecanismo de fallo **no puede ser** contención *entre* shards (no comparten DB); es coherente con contención *dentro* de la ejecución serial (`workers:1`) de un mismo shard — una request async de un spec anterior (`POST /api/clientes`, transacción Serializable) sigue en vuelo cuando el siguiente spec del mismo shard dispara `resetDatabase()`.
- **Se confirma con evidencia directa** (no ya inferencia) el punto que el propio AGENTS.md #20 dejó como "candidato sin explorar": el output de `clean.ts` — incluidos los `console.log` nuevos del fix de ayer (`Cleaned X`, `Skipped X`, `Lock contention on X, retrying in Nms (i/4)...`) — **no aparece ni una sola vez en ninguno de los 8 logs de CI** (`grep -c "Lock contention on\|Cleaned \|Skipped " → 0` en los 8 shards). Confirma que `execSync(..., { stdio: 'ignore' })` en `e2e/fixtures.ts` (líneas ~40 y ~47 según AGENTS.md) silencia por completo la salida de `clean.ts`, y por lo tanto **no hay forma de verificar, con los logs actuales, si el retry de `lock_timeout` introducido por el commit `b3162bbf` se ejecuta o funciona como se diseñó**.
- El log muestra `"Sesión invalidada: no existe o expiró"` con alta frecuencia (241 ocurrencias agregadas en los 8 shards, ~30/shard) distribuidas a lo largo de todo el run, con `sessionId`/`userId` distintos cada vez — consistente con el mecanismo ya documentado (`TRUNCATE` de `SesionActiva` en cada reset invalidando sesiones), pero **no es evidencia nueva por sí sola**: podría ser ruido benigno absorbido por el cache self-healing de `e2e/fixtures.ts`, o podría ser la causa real. No se puede distinguir sin la visibilidad de (2) más abajo.
- Se descartó la hipótesis de memoria: los 24 hits de `grep -i "oom"` eran falsos positivos de una línea de configuración de RediSearch (`oom policy: return`), no eventos reales de out-of-memory.

**Próximo paso concreto (no ejecutado en esta sesión, pendiente de confirmación del usuario por implicar push + consumo de CI real):** cambiar `stdio: 'ignore'` → `stdio: 'inherit'` (o redirigir a un archivo) en las 2 llamadas a `execSync` de `resetDatabase()`/`resetTestDatabase()` en `e2e/fixtures.ts`, como diagnóstico puntual — es un cambio de una línea, no altera comportamiento de tests, solo visibilidad de logs. Correr un ciclo de CI con eso activo respondería definitivamente si el retry de `clean.ts` se dispara y qué resultado tiene, cerrando la pregunta que quedó abierta en AGENTS.md #20 desde el run anterior (`32683746373` mismo commit ya estaba corrido cuando se escribió esa nota, pero sin esta instrumentación).

---

## Resumen para el dashboard de progreso (plan §24)

| Categoría | Total identificado en Fase 0 | Revisados (evidencia completa) | Resueltos | Pendientes |
|---|---|---|---|---|
| Código candidato muerto | 1 (`playwright.test.config.ts`) | 0 | 0 | 1 |
| Tests huérfanos de CI (no confundir con "excluidos deliberadamente") | 4 (`prisma/__tests__/*.test.ts`) | 0 | 0 | 4 |
| Legacy activo confirmado | 1 (`syncQueue`) | Parcial (falta dato de producción) | 0 | 1 |
| Hallazgos colaterales (no legacy de test/código) | 2 (drift de versiones, CI E2E roja) | Documentados | 0 | 2 (fuera del alcance directo de este plan, pero bloquean su ejecución segura) |
