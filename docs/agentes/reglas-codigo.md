# Reglas de código, backlog y respuestas

**Origen:** [reglas originales líneas 625–666](fuente-original/03-reglas-codigo.md), conservadas literalmente. Este documento organiza sus cláusulas sin excepciones tácitas.

## Código y seguridad

- **Tipado estricto. Sin `any`.** No introducir `as any`, `any[]` ni genéricos `any`. Para entrada no tipada usar `unknown` con validación y tipos específicos.
- Sin `// TODO` abandonados. Los marcadores TODO/FIXME/HACK/XXX en código deben enlazar un Issue (`TODO(#N)`) o acogerse a la excepción formal del workflow.
- Manejo de errores real: try/catch cuando corresponda, logger y rutas de fallo verificables; `console.log("error")` no basta.
- No inventar paquetes, APIs, métodos, flags ni sintaxis: contrastar contra biblioteca **instalada**, documentación primaria y Context7 si aplica/está disponible.
- No presentar benchmarks, límites, garantías de rendimiento ni compatibilidad entre versiones sin fuente. Entregar código funcional y pruebas reales; si un bug ya existe, señalarlo antes de implementar.
- `Depends` es válido solo cuando la respuesta cambia con circunstancias identificadas; explicar ramas concretas.
- El código que trata dinero, producción, inventario o offline debe revisar roles, idempotencia, concurrencia, históricos, cálculos exactos, fecha de atribución y consumidores del contrato.

## Fuente y precedentes

Priorizar: decisiones de producto aprobadas recuperables; código y tests actuales para estado técnico; documentación oficial de versión exacta; Issues/PRs/CHANGELOG; implementaciones y experiencias verificables de comunidades (Stack Overflow, Reddit/HN, blogs) con límites explícitos. **Una respuesta previa de un LLM, sin fuentes ni comprobación, nunca es autoridad**. Esto no invalida una decisión **aportada o aprobada por la persona** en una conversación histórica.

## Backlog

`GitHub Issues` es la autoridad de estado de tareas, [docs/BACKLOG.md](../../docs/BACKLOG.md) su índice. Antes de trabajar una tarea nueva, verificar si existe; usar Hallazgo cuando corresponda y no duplicar problemas históricos ni registrar secretos. Los PR se vinculan a Issues (`Closes #N` si realmente cierran, `Refs #N` si solo relacionan), con permisos y etiquetas coherentes. La presencia de un workflow NO prueba por sí sola que el check sea obligatorio para fusionar: verificar protección real.

## Formato de evidencia

- Código en bloques con lenguaje, archivos nuevos con path; modificaciones por archivo y símbolo/función o línea verificable.
- Para varios archivos, mostrar dependencias y orden de cambio.
- Separar `PROPUESTA`, `IMPLEMENTADO`, `VALIDADO`, `QA PENDIENTE`, `BLOQUEADO`. Registrar versión/SHA y logs de pruebas verdaderas, no anunciadas.
- Evitar respuestas largas si no aumentan la precisión; no sacrificar requisitos, seguridad ni decisiones históricas por ahorrar tokens.

## Consulta

Este documento detalla las reglas resumidas en [AGENTS.md](../../AGENTS.md). El [protocolo](protocolo-investigacion.md), [flujo de entrega](flujo-entrega.md) y skills mantienen responsabilidades propias; no convertir esta guía en otra implementación de JL.
