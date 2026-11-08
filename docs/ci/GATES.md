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
