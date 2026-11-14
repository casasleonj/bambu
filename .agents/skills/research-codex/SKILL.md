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

## Qué es investigar aquí (no es inventar)

Casi nada es nuevo. Antes de proponer, averiguar **cómo se resolvió ya el mismo
problema**:

1. **Precedente de la comunidad** — cómo lo hacen proyectos mantenidos, issues
   cerrados, foros y blogs técnicos con datos.
2. **Precedente de empresas grandes y de industria** — el patrón que sobrevivió a
   escala, no el tutorial.
3. **Comparación explícita**: similitudes con nuestro caso, diferencias que
   importan, y qué parte es transferible.
4. **Adaptar, no copiar**: tomar la idea y ajustarla a nuestras invariantes
   (dinero, multi-rol, offline, auditoría). Copiar sin adaptar es un riesgo
   sistémico, no una solución.

El objetivo es reforzar la idea con evidencia ajena o descartarla antes de escribir
código, no producir una propuesta original.

## Fuentes: verificables y confirmadas

- Toda afirmación de una investigación lleva **fuente con URL y fecha de consulta**.
- Distinguir siempre: **documentación oficial** de la versión instalada vs.
  **consenso de comunidad** vs. **opinión de un blog** vs. **lo que no se pudo
  confirmar**. Una respuesta de otro LLM no es prueba (`AGENTS.md` §1.4).
- Si una fuente no se pudo abrir o no existe la versión citada, decirlo: eso es
  `NO VERIFICADO`, no una fuente.
- Prohibido inventar benchmarks, porcentajes de ahorro, versiones o límites.

## Modelo y esfuerzo: no se quema presupuesto

Decisión por defecto, contrastada contra documentación oficial y comunidad:

| Trabajo | Modelo / effort | Motivo |
|---|---|---|
| Extraer, ordenar y resumir fuentes | modelo barato + effort alto | el volumen es alto, el juicio bajo |
| Comparar alternativas, refutar, redactar conclusión | `gpt-6.1-sol` + `medium` | equilibrio documentado |
| Fuentes contradictorias, adversariales finos, diseño entrelazado | `sol` + `high` | sube solo con señal |
| `xhigh` / `max` | excepcional, con motivo escrito | coste alto, retorno decreciente |

- Por defecto **no** se usa el nivel máximo. Si se sube, se justifica en la misma
  respuesta.
- Codex permite fijarlo por invocación: `-c model_reasoning_effort="medium"`.
  Comprobar el encabezado `model:` / `reasoning effort:` que imprime cada run.
- El coste real depende del contexto y de las herramientas, no solo del effort:
  cachear el contexto y no repetir la misma investigación ahorra más que bajar un
  nivel.

## Documentación al día cuando se toca código

Investigar sin mirar la versión instalada produce APIs inventadas. Antes de
proponer cualquier llamada a librería, framework, SDK o API externa:

- **Context7** si está disponible (`DOC-1` al proponer, `DOC-2` al implementar),
  según `jl/references/engineering.md` §Context7.
- **Documentación primaria de la versión instalada**, y el `package.json` /
  `node_modules/<pkg>` real. En este repo, además, `node_modules/next/dist/docs/`:
  el Next.js instalado no es el del entrenamiento (`AGENTS.md` §5).
- Si Context7 y la documentación primaria discrepan, manda la primaria de la
  versión instalada y se registra la discrepancia.

## Sin ambigüedad, sin sesgo, sin duplicar lo que ya existe

- **Cero ambigüedad**: cada propuesta dice qué cambia, qué no, para qué rol, con
  qué datos, y qué NO se puede afirmar. Si queda una decisión abierta, se nombra
  como decisión, no se esconde en el texto.
- **Sesgos a declarar**: el que escribe, el de la fuente, el de la muestra. Una
  recomendación basada en un blog no pesa como la documentación oficial.
- **Adversariales y convergencia**: el bucle de refutación, los estados
  `CONVERGENCIA DE DISEÑO / CONDICIONADA / BLOQUEADA` y el criterio de parada **no
  se redefinen aquí**: están en `jl/references/convergence.md`. Esta skill los usa,
  no los duplica.

## No duplicar skills existentes (ahorro de tokens)

Antes de escribir un procedimiento nuevo, comprobar si ya existe:

| Necesidad | Dónde está ya |
|---|---|
| Registrar un hallazgo, bug o funcionalidad | `.agents/skills/hallazgo/` |
| Investigar → plan → implementar → validar | `.agents/skills/jl/` (`workflow.md`) |
| Adversariales, convergencia, criterio de parada | `jl/references/convergence.md` |
| Documentación de API de terceros | `jl/references/engineering.md` (Context7) |
| QA en navegador | `.agents/skills/qa-navegador/` |
| Comunicación con el PO, ejemplos cotidianos | `jl/references/comunicacion-usuario.md` |

Esta skill **solo** añade el enrutamiento a ChatGPT, la exigencia de fuentes y la
elección de modelo/effort. Si algo ya está resuelto arriba, se enlaza y no se
reescribe: duplicar reglas las desincroniza y gasta contexto en cada lectura.

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
