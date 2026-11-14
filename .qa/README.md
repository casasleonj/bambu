# Evidencia de QA por PR

Un archivo por PR, `pr-<N>.md`, escrito por el comando `/qa` con el bloque
`### QA en navegador` del skill
[`.agents/skills/qa-navegador/SKILL.md`](../.agents/skills/qa-navegador/SKILL.md).

El hook `.claude/hooks/qa-merge-gate.sh` (PreToolUse) lee este archivo y rechaza
`gh pr merge <N>` salvo que el estado sea `PASÓ` o `NO APLICA`. Sin archivo, con
`NO EJECUTADO` o con `FALLÓ`, el merge se bloquea.

Escape explícito y auditable: `QA_GATE=off gh pr merge <N> ...`. No hay bypass
silencioso; queda en el historial del shell y en el transcript.

Formato mínimo del archivo:

    ### QA en navegador
    - Estado: PASÓ | FALLÓ | NO EJECUTADO | NO APLICA
    - Build/SHA y entorno: ...
    - Herramienta: agent-browser <versión> | Playwright <proyecto>
    - Rol y datos: ...
    - Viewports: escritorio + móvil (o el afectado)
    - Recorridos: j/N
    - Pasos: 1. ... 2. ...
    - Esperado / Observado: ...
    - Incidencia: ...
    - Evidencia: capturas sanitizadas o descripción

Los artefactos pesados (`*.png`, `*.zip`, `*.webm`) no se versionan: se citan
por ruta local en el archivo `.md`. Nunca publicar capturas con nombres de
clientes, teléfonos, direcciones o importes reales.
