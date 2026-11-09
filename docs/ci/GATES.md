# Gates de merge y producción (#703)

Estado verificado el 2026-11-08 con `gh api` (solo lectura).

## Qué existe hoy

| Pieza | Comportamiento |
|---|---|
| Protección de `main` | **Ninguna**: `protected: false`, sin rulesets (`repos/…/rulesets` → `[]`) y sin checks requeridos. Un PR se puede fusionar con el CI en rojo. |
| `ci.yml` | Corre en `push` a `main`, `pull_request` y `workflow_dispatch`. Ya no hay cron (se retiró el soak del Hub, #703). |
| `quality` (tsc + unit) | Exigido por `ci-gate`. |
| `e2e` (8 turnos) | Exigido por `ci-gate` salvo PR solo de documentación (`detect-changes`: `docs/**` y `AGENTS.md`). |
| `e2e-hub` (V2 ON) | Exigido por `ci-gate`. Se conserva: producción corre con `NEXT_PUBLIC_PEDIDOS_V2=true` y `e2e` prueba V2 OFF. Su retiro es F10b (#312). |
| `lint`, `integration` | Informativos (`continue-on-error`); `ci-gate` los lista sin bloquear. |
| `migrate-deploy.yml` | Corre en `push` a `main` si cambian `prisma/schema.prisma` o `prisma/migrations/**`, **sin esperar al CI**. Usa `vercel@latest`. |
| Despliegue en Vercel | La integración Git despliega cada merge a `main` sin depender del CI (no se pudo consultar la configuración del proyecto desde esta sesión). |

## `ci-gate` (nuevo)

Job `CI gate (resumen)`, siempre se ejecuta (`if: always()`). Falla si `detect-changes`, `quality` o `e2e-hub` no terminan en `success`, o si `e2e` no termina en `success` cuando `e2e_required == 'true'`. Un job omitido, cancelado o con salida vacía **no** cuenta como éxito. Probado con 9 escenarios simulados del script (verde, `failure`, `skipped` con E2E requerido, `cancelled`, docs-only, `e2e_required` vacío, etc.).

## Decisiones que quedan para el PO (no se aplicaron)

1. Activar protección de `main` y marcar **solo** `CI gate (resumen)` como check requerido. No marcar los `E2E (n/8)` individuales: un matrix omitido no genera esos nombres y dejaría PRs colgados (actions/runner#952). Hoy el E2E tiene fallos de baseline (`dlq-4xx`, `productos-comprehensive`…), así que exigirlo bloquearía merges hasta estabilizarlos; considerar exigirlo primero solo en `quality` + `e2e-hub`.
2. Ordenar migración → despliegue: hoy `migrate-deploy` y Vercel arrancan a la vez al fusionar. Opciones: `workflow_run` tras el CI, o mantener la regla manual de AGENTS.md (migración en producción **antes** del merge).
3. Fijar la versión de `vercel` en `migrate-deploy.yml` en vez de `@latest`.

## Reversión

`ci-gate` es un job aparte: revertir su bloque no afecta al resto. El cron se restaura agregando de nuevo un bloque `schedule` en `on:`.


## Actualización 2026-11-09 (#703): protección de `main` y orden migración → despliegue

### Protección de `main` — pendiente de activar por el PO
La sesión de Claude **no puede escribir** la protección (GitHub responde 403 «Write access … not permitted through this proxy»). Para activarla: GitHub → Settings → Branches → *Add branch ruleset / protection rule* sobre `main`, con:
- **Require status checks to pass:** `Type check + Tests` y `E2E Hub (V2 ON)` (los dos corren siempre, también en PRs solo de documentación, y han sido fiables). **No** marcar los `E2E (n/8)` ni `Agent Instructions Audit` (este solo corre al tocar `AGENTS.md`: quedaría pendiente para siempre en otros PRs). `CI gate (resumen)` se puede sumar cuando el E2E se estabilice.
- Sin exigir revisiones ni «Do not allow bypassing» (el PO puede seguir fusionando); bloquear *force pushes* y borrado de `main`.
- Equivalente por línea de comandos: `gh api -X PUT repos/casasleonj/bambu/branches/main/protection` con `{"required_status_checks":{"strict":false,"contexts":["Type check + Tests","E2E Hub (V2 ON)"]},"enforce_admins":false,"required_pull_request_reviews":null,"restrictions":null,"allow_force_pushes":false,"allow_deletions":false}`.

### Orden migración → despliegue — script listo, **sin activar**
`scripts/vercel-ignore-build.mjs` (con 13 pruebas en `scripts/__tests__/vercel-ignore-build.test.ts`, incluida la comprobación de que fallan si la lógica se rompe) es un *Ignored Build Step* de Vercel (`ignoreCommand` de `vercel.json`; salida 1 = construir, 0 = cancelar, según la documentación de Vercel). En producción, si el commit toca `prisma/schema.prisma` o `prisma/migrations/**`, espera hasta 12 min a que `migrate-deploy.yml` termine en `success` **para ese mismo commit**; si falla, no aparece o se agota el tiempo, cancela el despliegue (el código nuevo no sale; se reintenta con *Redeploy*). Commits sin migración y vistas previas no cambian.

**Por qué no está activado:** `migrate-deploy.yml` falla en TODAS sus ejecuciones recientes (15 seguidas, desde 2026-10-26) con `The token provided via the --token option is not valid` (secreto `VERCEL_TOKEN` inválido). Activar el `ignoreCommand` hoy cancelaría para siempre todo despliegue con migración. Antes de enchufarlo hay que:
1. Que el PO genere un token nuevo (vercel.com/account/tokens, de una cuenta con acceso al equipo) y lo guarde como secreto `VERCEL_TOKEN` en GitHub.
2. Verificar con seguridad que `prisma migrate deploy` contra producción es correcto: si las migraciones posteriores a julio se aplicaron a mano (MCP) y no figuran en `_prisma_migrations`, el workflow intentaría reaplicarlas. Comparar `_prisma_migrations` con `prisma/migrations/` (consulta de solo lectura) y, si difieren, registrar con `prisma migrate resolve --applied <nombre>`.
3. Entonces agregar a `vercel.json`: `"ignoreCommand": "node scripts/vercel-ignore-build.mjs"` (opcionalmente `GITHUB_TOKEN` de solo lectura en Vercel para no depender del límite anónimo de la API de GitHub).

Hasta entonces sigue vigente la regla manual de AGENTS.md (Flujo de Entrega, paso 7): aplicar la migración en producción **antes** de fusionar.
