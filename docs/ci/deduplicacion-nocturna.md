# #896 · Deduplicación conservadora y regresión nocturna

## Contrato

La regresión suplementaria se evalúa diariamente a las 02:17 (Bogotá).
Se fuerza los lunes y al ejecutar manualmente el workflow desde main.
Los otros días se permite reutilizar exclusivamente un CI completo reciente
(menos de 24 horas) en el mismo SHA de main. No es una certificación de
despliegue; las validaciones normales de PR y push permanecen intactas.

La evidencia debe proceder de los workflows conocidos, mismo repositorio y
rama main, de la última ejecución pertinente, primer intento, y contener
todos los trabajos y pasos exigidos (typecheck, unit, lint, integración,
8 shards Playwright legacy, Hub ON, clasificador y gate). Verificar
identidad, completitud, éxito real y timestamps de los jobs, no solamente
conclusión global. Una corrida fallida/cancelada/en progreso, un perfil
manual ambiguo, intento mezclado, cambio de SHA, un job desconocido u
omitido, prueba obligatoria ausente, API incompleta o error de consulta
impiden reutilizar. Un reporte de reutilización nocturna no se considera
una nueva ejecución completa. Los errores del propio plan o su validación
dejan el workflow en rojo; no se interpretan como un éxito.

La regresión reutiliza ci.yml como workflow_call con nightly_full=true y
pedidos_v2=false: quality, lint, integración, los ocho shards y Hub.
En ese contexto lint/integración son bloqueantes. No se cambian sus
reglas en el CI normal. El caller y CI nocturnos tienen concurrencia
separada de PR/push/dispatch normales. La hora :17 evita el comienzo
de hora; no se garantiza puntualidad de GitHub cron.

## Deduplicación PR -> main: observación, no bypass

El CI de PR completo publica un marcador observacional con el github.sha
del candidato real, run e intento. El observador de push de main busca
marcadores de candidato del mismo SHA y comprueba jobs/pasos del PR
asociado. Puede indicar possibleDuplicatePRRuns; no descarga ni ejecuta
contenido del artefacto ni usa nombres de artefacto como evidencia de
certificación. canSkipRelease=false siempre. PRs y merges squash normalmente
tienen SHAs distintos y no se reutilizan por supuesto parecido de cambios.

No habilitar omisiones entre PR y main hasta demostrar protección de rama,
promoción efectivamente protegida, identidad y equivalencia de candidatos,
origen confiable de la prueba y política de despliegue aprobada. Este cambio
no modifica Vercel, migrations, rulesets ni required checks.

## Validación, límites y operación

- Node sin dependencias: node --test scripts/ci/__tests__/reuso-ci.node.test.mjs
- El PR valida la política; el cron solo opera en la rama por defecto
  tras integrar. Ejecutar manualmente en main y comprobar luego una
  decisión de reutilización y una de ejecución completa reales.
- Consultar el resumen de Actions, SHA y run de evidencia. Un rojo nocturno
  debe investigarse; se emiten errores visibles en Actions. No se crea un
  issue automáticamente ni se ha comprobado la entrega de notificaciones;
  la vigilancia externa de cron ausente sigue pendiente.
- No se declara equivalencia absoluta de entornos volátiles; la ventana de
  24 h y corrida semanal son decisiones conservadoras de regresión, no de release.
- No se mide ahorro todavía. El criterio por jobs/pasos no prueba IDs de
  todos los tests, retries o flakiness; esa evidencia sigue pendiente para
  cualquier reducción efectiva del CI de release.
- #897 también modifica ci.yml: reconciliar explícitamente los cambios antes
  de integrar para conservar el gate reforzado y ambos perfiles. No apilar ramas
  ni resolver conflictos descartando la intención de la otra fase.
- Reversión: deshabilitar únicamente CI nightly and dedup observation, o
  revertir el PR. No hay cambios de datos ni de producción.
