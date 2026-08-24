# TESTING_BASELINE.md

**Fecha del snapshot:** 2026-08-24
**Fase:** 0 — Congelar la fotografía actual (ver `AGUA_BAMBU_PLAN_ATAQUE_AUDITORIA_TESTS_CODIGO.md`)
**Regla de salida de esta fase:** no avanzar a eliminación de tests/código hasta que este baseline exista y sea reproducible. Este documento cumple esa condición; **no autoriza por sí mismo ninguna eliminación** — eso requiere las Fases 1-11.

---

## 1. Commit y entorno

| Campo | Valor |
|---|---|
| Commit `main` | `4c6cba350c20b01d05f0d1ee2fb8a17f41d566ea` (2026-08-24 04:23:12 -0500) |
| Working tree | Limpio salvo 2 archivos untracked ajenos a este plan (`planembarquesuxequipodesarrollo*.md`) |
| Node local | v23.11.0 |
| Node en CI (`.github/workflows/ci.yml`) | **22** — distinto de la versión local. No hay `.nvmrc` verificado en este snapshot; si se reproduce el baseline localmente, usar Node 22 para igualar CI. |
| npm | 11.12.1 |

## 2. Versiones pinneadas (contrastadas contra `package.json` real)

| Paquete | Versión en `package.json` | Coincide con AGENTS.md |
|---|---|---|
| next | 16.2.4 | Sí |
| react / react-dom | 19.2.4 | Sí |
| typescript | 5.9.3 | Sí |
| next-auth | 5.0.0-beta.31 | Sí |
| prisma / @prisma/client | 6.19.3 | Sí |
| tailwindcss | 4.2.4 | Sí |
| dexie | 4.4.2 | Sí |
| zustand | 5.0.12 | Sí |
| sonner | 2.0.7 | Sí |
| @playwright/test | 1.59.1 | Sí |
| vitest | 3.2.4 | Sí |
| eslint | 9.39.4 | Sí |
| redis | 5.12.1 | Sí |
| rate-limiter-flexible | 11.0.1 | Sí |
| @sentry/nextjs | 10.55.0 | Sí |
| pino | 10.3.1 | Sí |
| zod | 4.3.6 | Sí |
| **serwist / @serwist/next / @serwist/turbopack** | **`^9.5.12`** | **No** — AGENTS.md dice "Serwist 9.5.7" pinneado sin `^`. Drift real, documentado en `LEGACY_INVENTORY.md`. |
| @vitest/coverage-v8 | `^3.2.4` | N/A (no documentado en AGENTS.md) — también viola la regla "ALL dependency versions are pinned". |

**Hallazgo de Fase 0:** la regla "ALL dependency versions are pinned (no `^` or `~`)" del AGENTS.md **no se cumple actualmente** para 4 paquetes. Esto no es parte del plan de auditoría de tests/código muerto, pero es evidencia que contradice documentación vigente — se registra aquí, no se corrige (Fase 0 es solo fotografía).

## 3. Prisma

| Campo | Valor |
|---|---|
| Provider | `postgresql` (único, confirmado — sin schema SQLite) |
| Migraciones en `prisma/migrations/` | 43 |

## 4. Comandos de test actuales (`package.json`)

```
npm run test              → vitest run                                   (unit)
npm run test:coverage     → vitest run --coverage
npm run test:integration  → vitest run --config vitest.integration.config.ts
npm run test:e2e          → playwright test                              (usa playwright.config.ts)
```

No existe script para `playwright.test.config.ts` ni para `prisma/__tests__/**` — ver `LEGACY_INVENTORY.md`.

## 5. Suites incluidas/excluidas (confirmado contra config real, no solo contra AGENTS.md)

### Playwright (`playwright.config.ts`)

- `testDir: './e2e'`
- `testIgnore: ['**/exploratory/**', '**/qa-comprehensive/**', '**/produccion/**']`
- `workers`: `1` en CI (`process.env.CI ? 1 : 1`, overridable vía `PW_WORKERS`), `1` en local también.
- `e2e/qa/` **no** está excluido — corre en CI. Confirma la lectura del plan de ataque (§2).
- 2 `projects`: `chromium` y `chromium-mobile` (viewport iPhone 13, sin WebKit real).
- `webServer` en CI corre contra `node .next/standalone/server.js` (build de producción), no contra `next dev`.

### Vitest unit (`vitest.config.ts`)

- Excluye: `node_modules/**`, `.opencode/**`, `e2e/**`, `.next/**`, `.worktrees/**`, `src/lib/__tests__/integration/**`, **`prisma/__tests__/**`**.

### Vitest integration (`vitest.integration.config.ts`)

- `include: ['src/lib/__tests__/integration/**/*.test.ts']` — únicamente. `pool: forks`, `singleFork: true` (serializa contra la DB real).

### CI (`.github/workflows/ci.yml`)

4 jobs:

| Job | Bloqueante | Contenido |
|---|---|---|
| `quality` | **Sí** | `tsc --noEmit` + `npm run test` (unit) |
| `lint` | No (`continue-on-error: true`) | `eslint --max-warnings 999` |
| `integration` | No (`continue-on-error: true`) | `npm run test:integration` contra Postgres+Redis real en Docker |
| `e2e` | **Sí** (implícito — sin `continue-on-error`) | `playwright test`, matriz de **8 shards** contra build standalone |

## 6. Conteo de tests descubiertos (medido, no estimado)

| Suite | Archivos | Tests |
|---|---|---|
| Playwright, config default (`playwright test --list`) | 107 archivos activos de 189 totales en `e2e/` | **1660 tests** |
| Playwright, excluidos por `testIgnore` | 82 archivos (`qa-comprehensive`: 66, `exploratory`: 13, `produccion`: 3) | no medido — nunca se listan |
| Vitest unit | 263 archivos | ~2637 casos (`grep -E "^\s*(it|test)\("`, aproximado — puede sobreconta/subcontar `it.each`, `describe.each`, tests generados dinámicamente) |
| Vitest integration | ver `TEST_INVENTORY.md` | no medido en este snapshot |
| `prisma/__tests__` (huérfano) | 4 archivos | no medido — no corre en ningún config |

## 7. Estado actual de CI — **no está verde**

Esto es el hallazgo más importante de este baseline y cambia el contexto de riesgo de todo el plan: **no se puede asumir que "CI pasa" hoy**, por lo tanto cualquier cambio de saneamiento debe evaluarse contra una CI ya inestable, no contra una CI de referencia sana.

Últimos 30 runs de `ci.yml` en `main` (vía `gh run list`):

| Conclusion | Cantidad |
|---|---|
| success | 15 |
| failure | 11 |
| cancelled | 3 |
| (en progreso al momento del snapshot) | 1 |

Desglose del run completado más reciente antes de este snapshot (`32683746373`, commit `b3162bbf`):

| Job | Resultado |
|---|---|
| Type check + Tests (quality) | ✅ success |
| Lint (non-blocking) | ✅ success |
| Integration tests (non-blocking) | ✅ success |
| E2E shard 1/8 | ❌ failure |
| E2E shard 2/8 | ❌ failure |
| E2E shard 3/8 | ❌ failure |
| E2E shard 4/8 | ❌ failure |
| E2E shard 5/8 | ❌ failure |
| E2E shard 6/8 | ❌ failure |
| E2E shard 7/8 | ❌ failure |
| E2E shard 8/8 | ❌ failure |

**Discrepancia con AGENTS.md Known Issue #20/#25/#26**: la documentación existente caracteriza el problema de E2E en CI como determinísticamente confinado a **shard 1** ("el shard 1 de E2E falla de forma determinística en 3 runs de CI independientes... siempre cascadeando a la misma familia de specs"). El run medido en este snapshot muestra **los 8 shards fallando simultáneamente**, no solo shard 1. Dos lecturas posibles, ninguna descartable sin más evidencia:

1. El problema documentado como "shard 1" escaló y ahora afecta a todos los shards (regresión sobre la causa raíz ya identificada — lock-contention en `clean.ts` — o una causa nueva).
2. Hay más de un mecanismo de fallo simultáneo (el de shard 1 ya documentado + algo adicional que tumba los demás shards en este run puntual).

**No se investiga la causa en esta fase** (Fase 0 es solo fotografía) — se registra como hallazgo prioritario para retomar antes o en paralelo a la Fase 8 (aislamiento/paralelización) del plan, dado que invalida parcialmente la lectura de "shard 1 únicamente" que tenía AGENTS.md hasta este snapshot.

## 8. Duración por job (medida, run `32683746373`)

| Job | Inicio | Fin | Duración aprox. |
|---|---|---|---|
| Type check + Tests | 02:39:06 | 02:42:06 | ~3 min |
| Lint | 02:39:06 | 02:40:28 | ~1.4 min |
| Integration | 02:39:08 | 02:41:49 | ~2.7 min |
| E2E shard 1/8 | 02:39:07 | 02:56:14 | ~17 min |
| E2E shard 2/8 | 02:39:06 | 02:57:19 | ~18 min |
| E2E shard 3/8 | 02:39:07 | 03:00:24 | ~21 min |
| E2E shard 4/8 | 02:39:07 | 02:55:29 | ~16 min |
| E2E shard 5/8 | 02:39:07 | 02:58:10 | ~19 min |
| E2E shard 6/8 | 02:39:06 | 03:04:09 | ~25 min |
| E2E shard 7/8 | 02:39:06 | 02:52:32 | ~13 min |
| E2E shard 8/8 | 02:39:06 | 02:54:13 | ~15 min |

Todos los shards corren en paralelo (matriz de GitHub Actions), así que la duración total del job `e2e` es la del shard más lento (~25 min), no la suma.

## 9. Flaky/failures conocidos (de fuentes existentes, no re-investigado aquí)

Ver AGENTS.md Known Issues #20, #25, #26 para el historial narrativo ya documentado de flakiness E2E (login-race resuelto, DB-reset cross-worker no resuelto, lock-contention en `clean.ts` con fix parcial que **no** resolvió el shard 1 según el propio commit `4c6cba35` de este snapshot). Este baseline no reemplaza esa narrativa — la complementa con el dato duro de que el run más reciente medido muestra fallo en **todos** los shards, no solo el 1.

## 10. Artefactos generados en esta fase

- `docs/testing/TESTING_BASELINE.md` (este archivo)
- `docs/testing/TEST_INVENTORY.md` — inventario completo de archivos de test (Playwright + Vitest), generado por script contra el filesystem real, con clasificación de inclusión en CI derivada de los configs reales (no de suposiciones).
- `docs/testing/LEGACY_INVENTORY.md` — hallazgos de Fase 0 que son candidatos para las fases de auditoría de legacy/código muerto (Fases 9-10), **sin decisión de eliminación tomada**.

## 11. Qué NO cubre este baseline (explícitamente fuera de alcance de Fase 0)

- Clasificación semántica de cada test (`BEHAVIORAL`/`CONTRACT`/`REGRESSION`/etc. — Fase 5).
- Auditoría de fixtures (Fase 3).
- Duplicación semántica entre suites (Fase 6).
- Investigación de la causa raíz del fallo de los 8 shards (§7) — se registra, no se resuelve aquí.
- Cualquier decisión de eliminación — ningún archivo listado en `TEST_INVENTORY.md` o `LEGACY_INVENTORY.md` debe borrarse basándose únicamente en este snapshot.
