# #896 · Integración concurrente de PR sin CI infinito

Fecha de verificación: 2026-11-22. **Estado: PROPUESTA documentada; ningún mecanismo de merge ni ahorro en release está activado por este documento.**

## Problema y objetivo

El usuario reporta un ciclo en el que los PR A y B completan CI en verde, A se fusiona y B vuelve a ejecutar toda la suite porque `main` avanzó. El objetivo es disminuir **latencia de fusión, runner-minutos y revalidaciones redundantes**, conservando la detección de incompatibilidades y sin permitir código no certificado en producción.

No confundir: (1) un nuevo `push` al mismo PR; (2) avance de `main` por otro PR; (3) nueva prueba `push` en `main`; (4) repetición de builds dentro de una ejecución. Son problemas distintos, con controles distintos.

## Hechos verificados (reposición actual)

- Ruleset de `main` [27807059](https://github.com/casasleonj/bambu/rules/27807059): activo, `strict_required_status_checks_policy=true`, requiere `CI gate (resumen)`; evita eliminación y no-fast-forward. **No desactivarlo como solución rápida.**
- `.github/workflows/ci.yml`: CI en PR y en push a `main`. En PR clasifica cambios documentales y distingue borradores; `concurrency` cancela intentos obsoletos de una referencia, no deduplica trabajo entre PRs independientes. El gate exige calidad, integración real y E2E aplicable.
- La matriz E2E tiene ocho shards. Cada shard realiza instalación/Prisma, `npm run build` y Playwright en su runner. El job Hub (V2 ON) también hace `npm run build`; hay hasta **nueve builds por ejecución full**. El build con V2 ON **no es intercambiable** automáticamente con V2 OFF: las variables `NEXT_PUBLIC_*` quedan incorporadas al build.
- [Selector sombra](./selector-impacto-sombra.md), `ci-impact-shadow.yml` y `scripts/ci/reuso-ci.mjs` ya existen. Su análisis y artefactos de deduplicación son **observacionales**, `canSkipRelease=false`. No duplicar ni convertir esos datos en autorización de merge.
- La regresión `ci-nightly.yml` ya está configurada y conserva separación del gate de release. No sustituye la certificación requerida antes de liberar.
- Ejemplos de ejecuciones consultadas: [PR #972 (aprox. 15 min)](https://github.com/casasleonj/bambu/actions/runs/45036618417), [main (aprox. 20 min)](https://github.com/casasleonj/bambu/actions/runs/45033674810), [main (aprox. 58 min)](https://github.com/casasleonj/bambu/actions/runs/45026219550). Muestras puntuales, **no** p50/p95 calculados.

## DECISIÓN DE DIRECCIÓN (PO 22/11) Y LÍMITE DE AUTORIZACIÓN

Continuar #896 como única iniciativa de CI adaptativo, conservando gates y evidencia verificable. Priorizar mejora del paralelismo y reducción de trabajo duplicado por etapas. El acuerdo de dirección **no autoriza** alterar el ruleset, desplegar, habilitar selección de pruebas para saltar gates ni ejecutar merge automático. La arquitectura de integración se conserva como **PROPUESTA** sujeta a pruebas adversariales.

## Diseño propuesto

### F1. Baseline y optimización de builds, sin reducir cobertura

1. Medir p50/p95 de `ready_for_review → merge`, duración por job, runner-minutos, cancelaciones, número de compilaciones, coste y fallos de baseline, usando historial suficientemente representativo.
2. Prototipar build único compartido para los ocho shards V2 OFF y otro build independiente V2 ON. Publicar artefactos inmutables con identidad de commit/árbol, perfil de flags, versión Node/Next/Prisma y lockfile, con checksum, permisos de solo lectura y retención breve. Cada shard deberá conservar su **propia BD/Redis/fixtures** para no mezclar estado. Revisar que el build standalone contenga estáticos, ficheros generados y runtime esperado.
3. Comparar p50/p95 y runner-minutos antes/después. Abortar o revertir si el tiempo de empaquetado/descarga o la inestabilidad anula el beneficio. **No modificar los tests de negocio para alcanzar el objetivo.**

### F2. Selector de pruebas por impacto, modo sombra

Aprovechar `#901` integrado: medir falsos negativos, cobertura exacta por entorno, rol, flag y dependencias transitivas. Tests compartidos, API/Prisma, Caja/Finanzas/Inventario, auth, infra/fixtures y cambios ambiguos fuerzan cobertura conservadora. Un resultado sin tests esperados es error. El modo sombra jamás certifica release.

### F3. Validar PRs concurrentes como combinación exacta

Se deben separar **certificación de PR individual** y **certificación del candidato de integración**. La confirmación de PR A verde + PR B verde no prueba automáticamente A+B.

**Alternativa preferida para evaluar:** GitHub Merge Queue nativo si la titularidad/plan/configuración de la organización y los integradores lo permiten; comprobar soporte antes de recomendar migración. El workflow de `merge_group` debe emitir un único gate requerido y validar la combinación exacta que será fusionada. Definir límites de lote y estrategia de diagnóstico cuando falle un grupo.

**Alternativa sin cambio de titularidad:** cola serializada controlada, sin bypass de `main`, con candidato sintético inmutable sobre la punta real de `main`. Al aprobarse, comprobar que la rama objetivo no ha avanzado y que el árbol certificado es el que se va a fusionar; revalidar ante discrepancia. No asumir que GitHub puede aplicar una certificación de una rama temporal a un PR distinto de manera automática. Si no es posible garantizar identidad/atomicidad por permisos/herramientas, **mantener strict y CI full**; no anunciar ahorro ficticio.

### F4. Duplicación PR → push y despliegue

Distinguir validar un mismo árbol de ejecutar otra certificación sobre otro SHA. Reutilización solo con identidad reproducible de **contenido + base + perfil flags + dependencias + versión de workflow/selector + entorno + resultados de jobs**. No usar un artefacto de sombra, caché o check de una base anterior como certificado. Revisar control real de despliegue de Vercel y migraciones Prisma. No aplicar ahorro post-merge antes de demostrar que producción no se adelanta a un gate requerido.

## Casos adversariales obligatorios

| Escenario | Esperado |
|---|---|
| PR A (gastos) y B (pedidos) cambian distintos archivos, pero comparten validador/import indirecto | Detectar dependencia, no declarar independencia por rutas |
| PR A y B pasan aislados pero falla su unión | Bloquear candidato; no generar falso verde |
| `main` avanza durante la validación de candidato | Invalidar/rehacer comprobación de identidad; nunca merge sobre evidencia obsoleta |
| Cancelación de un PR tras push nuevo | Cancelar solo la referencia obsoleta; no cancelar verificación de otro candidato |
| Múltiples PR con mismo archivo, rename, symlink o diff no legible | Escalamiento conservador y resolución de conflicto |
| Flags V2 ON/OFF | Generar y validar artefactos separados |
| Cambio de Prisma, auth, caja, cartera, dinero, offline, workflows o tests | Cobertura ampliada/full según política, sin atajo manual |
| Falla de descarga de build, checksum incorrecto, artifact missing | Fallar job, nunca ejecutar E2E sobre build parcial |
| Cambios de lockfile/entorno/versiones, o selector modificado | Invalidar reutilización previa |
| Fallo del deployment/migración, incluso con CI verde | Mantener bloqueo de promoción y trazabilidad del incidente |

## Criterios de aceptación de un futuro PR funcional

- Comparación documentada antes/después con muestras equivalentes, sin extrapolar de un único run.
- E2E V2 OFF (ocho shards) y Hub V2 ON pasan con **los mismos specs/assertions** y sin escrituras en producción.
- Pruebas unitarias del planificador/identidad/artefactos; mutaciones sintéticas que demuestren que la política bloquea errores sembrados.
- Pruebas reales de GitHub Actions: 2 PR disjuntos, 2 PR conflictivos, nuevo push durante cola, fallo de CI, avance de `main`, rollback y cancelación.
- Evidencia de guardas de producción, especialmente migración/CI en Vercel. No fusionar si esta barrera no puede verificarse.
- Revisión de cambios del ruleset en una etapa explícita y separada. Nunca hacer `strict=false` silenciosamente como prueba de concepto.
- Un PR por fase, con instrucciones de rollback. No fusionar por el mero hecho de documentar este plan.

## Referencias

- [Issue central #896](https://github.com/casasleonj/bambu/issues/896)
- [GitHub Merge Queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
- [GitHub Required Status Checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Investigación Google sobre regression test selection](https://research.google/pubs/techniques-for-improving-regression-testing-in-continuous-integration-development-environments/)
- [Selector sombra #896](./selector-impacto-sombra.md)

**Estado final de este documento:** DIAGNÓSTICO + PROPUESTA. No se ha cambiado la semántica del producto ni los gates.
