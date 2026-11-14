---
description: Research con ChatGPT/Codex antes de decidir (ideas, funcionalidades, adversariales, comparaciones)
argument-hint: "[pregunta o issue a investigar]"
---

Investiga lo siguiente con ChatGPT vía Codex CLI, siguiendo
`.agents/skills/research-codex/SKILL.md`:

$ARGUMENTS

Procedimiento:

1. Reformula la pregunta y explicita los supuestos antes de invocar nada. Si la
   tarea escribiría código de producto, detente: esto es R3 y requiere aprobación,
   no research.
2. Recupera primero lo que ya está decidido en el repo (`AGENTS.md`,
   `docs/agentes/`, issues relacionados). No investigues de cero lo que ya está
   resuelto; cita la decisión previa si existe.
3. Invoca Codex en solo lectura:

       codex exec --sandbox read-only --skip-git-repo-check "<pregunta + contexto mínimo>"

   Si falla con `bwrap: No permissions to create a new namespace`, reintenta con
   `--sandbox danger-full-access` y verifica después con `git status` que no se
   tocó ningún archivo.
4. Devuelve: pregunta reformulada, opciones con trade-offs, casos adversariales,
   casos no contemplados, evidencia con versión cuando aplique, qué no se puede
   afirmar, y siguiente paso propuesto.
5. Declara el modelo real que contestó, leyendo el encabezado `model:` /
   `provider:` que imprime Codex. No lo supongas.
6. Contrasta lo que la respuesta afirme sobre el repo contra `main` a SHA. Una
   respuesta de otro LLM no es prueba por sí misma.

No implementes nada en este comando. Si la investigación concluye que hay que
cambiar código, el siguiente paso es presentar el plan y esperar aprobación.
