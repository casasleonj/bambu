---
name: research-codex
description: "Enruta research a ChatGPT/Codex: ideas, funcionalidades, adversariales, comparaciones y documentación. No implementa."
metadata:
  display_name: "Research con ChatGPT/Codex"
  version: "1.0.0"
---

# Research con ChatGPT · enrutamiento obligatorio

Reparto de roles heredado del Contexto Maestro v3.0 (§4.2) y vigente en este
repositorio: **el criterio y el desarrollo conceptual son de ChatGPT; la
implementación es de Claude Code/OpenCode; la decisión de negocio es del PO.**
`AGENTS.md` §3 exige R1+R2 antes del código, pero no decía quién investiga: esto
lo cierra.

## Tabla de enrutamiento (sin ambigüedad)

| Tarea | Agente | Vía |
|---|---|---|
| Idea nueva, desarrollo conceptual | **ChatGPT** | `codex exec` |
| Funcionalidad por diseñar (alcance, opciones, riesgos) | **ChatGPT** | `codex exec` |
| Investigación técnica (documentación, versiones, precedentes) | **ChatGPT**, con verificación local | `codex exec` + fuentes |
| Casos adversariales y casos no contemplados | **ChatGPT** | `codex exec` |
| Comparación de alternativas (librerías, patrones, enfoques) | **ChatGPT** | `codex exec` |
| Documentación que exija criterio | **ChatGPT** para el contenido | `codex exec` |
| Implementar, corregir, refactorizar, tests | Claude Code / OpenCode | `/jl`, Claude |
| QA en navegador como usuario | Claude Code + agent-browser | `/qa` |
| Decisión de producto, negocio, UI/UX | **PO** | escalar, no resolver |

Regla de desempate: si la tarea **escribiría código de producto**, no es research,
aunque empiece como investigación. Va a R3 con aprobación.

## Cómo se invoca

```sh
codex exec --sandbox read-only --skip-git-repo-check "<pregunta>"
```

- `--sandbox read-only`: research no escribe. Si el sandbox del host no permite
  namespaces (`bwrap: No permissions to create a new namespace`), usar
  `--sandbox danger-full-access` **y** confirmar con `git status` que no se tocó
  nada: el proceso es la barrera, no el sandbox.
- `--skip-git-repo-check` solo fuera de un repo; dentro, omitirlo.
- El encabezado de `codex exec` imprime `model:` y `provider:`. **Declararlos en la
  respuesta**: es la prueba de qué modelo contestó, no una suposición.
- Con prompts largos, pasar el material por archivo o por `git diff` en el propio
  prompt; no pegar credenciales ni datos de clientes.

## Qué debe devolver una investigación

1. **Pregunta reformulada** y supuestos que se están asumiendo.
2. **Opciones con trade-offs**, no una sola respuesta cómoda.
3. **Casos adversariales**: qué la rompe, qué no se contempló.
4. **Evidencia y fuentes** con versión cuando aplique (documentación oficial de la
   versión instalada, no de la de entrenamiento).
5. **Qué NO se puede afirmar** con la información disponible.
6. **Siguiente paso propuesto**, explícitamente marcado como propuesta.

## Límites que no se relajan

- Investigar **no autoriza** escribir código ni ejecutar R3 (`AGENTS.md` §3).
- Una respuesta de otro LLM **no es prueba** por sí misma (`AGENTS.md` §1.4): las
  afirmaciones sobre el repo se verifican contra `main` a SHA, y las de terceros
  contra documentación oficial.
- Codex no decide producto ni negocio; si la pregunta es de negocio, se escala al
  PO en vez de resolverla.
- No se registran secretos, datos de clientes ni credenciales en el prompt ni en
  el Issue resultante.

## Cuándo NO usarlo

- Consulta trivial que se responde leyendo el repo (`grep`, `gh issue view`).
- Bug con reproducción clara: es `/hallazgo` + `/jl`, no research.
- Decisión ya tomada y documentada: se aplica, no se reabre sin evidencia nueva.

## Registro

Si la investigación produce una decisión o un cambio de alcance, se registra como
Issue con `/hallazgo` (o se comenta en el existente) citando el modelo que la
produjo y las fuentes. La conversación no es el registro.
