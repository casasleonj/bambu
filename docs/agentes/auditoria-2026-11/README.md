# Migración de instrucciones · Fase 0 (no operativa)

**Issue:** #716 · **Política que requiere PO:** #704 · **Duplicación histórica:** #335.

**Estado a 2026-11-08: CONVERGENCIA DE DISEÑO CONDICIONADA. NO APTO PARA SUSTITUIR AGENTS.md NI PARA MERGE DE ARQUITECTURA V2.**

## Estado verificable

- `AGENTS.md` original no se modifica en esta fase. Blob `4182d57064c7f89c2eea39e86d1e0b469179bb06` del `main` baseline `50d3d69b18f4c9c4c5fa4ff14ca95045c3308c6c`.
- `matriz_fuente_798.csv` identifica las 798 posiciones del snapshot (incluye posición vacía terminal) por URL de fuente inmutable, destino previsto y categoría provisional. **No es certificación de equivalencia semántica**.
- `CONTRADICCIONES_Y_DECISIONES.md` registra doce conflictos/riesgos; resueltos por alcance si hay evidencia y en estado PO cuando alteran política.
- `PRUEBAS_REALES_Y_GATES.md` define 12 escenarios × 3 agentes × baseline/candidato, con controles positivos y negativos. **Ninguna ejecución real se ha atribuido como realizada aquí**.
- `evidencia_no_ejecutada.json` contiene estados pendientes deliberadamente: no reemplazar por marcas PASS sin logs y revisión.

## Evaluar sin alterar el repo

```bash
python -m unittest discover -s scripts/auditoria-agentes/tests -v
python scripts/auditoria-agentes/check_cutover.py \
  --repo . \
  --matriz docs/agentes/auditoria-2026-11/matriz_fuente_798.csv \
  --evidencia docs/agentes/auditoria-2026-11/evidencia_no_ejecutada.json \
  --salida /tmp/agent-guidance-audit.json
```

La salida **BLOQUEADO** es correcta: significa que la migración completa sigue sin cumplir sus gates. La CI se activa para cambios de instrucciones o de la auditoría; **si un PR modifica AGENTS.md**, ejecuta el gate estricto y exige pruebas antes del reemplazo. La comprobación mecánica NO garantiza que una traza descrita en JSON sea genuina; requiere validación humana independiente.

## Antes de proponer un nuevo AGENTS.md como operativo

1. Descomponer 798 posiciones y 49 incidencias en obligaciones semánticas, incluidas condiciones, excepciones e invariantes. Conservar texto original o equivalencia respaldada por fuente y prueba.
2. Decidir formalmente #704; la opción sugerida en ese issue **aún no está aprobada**.
3. Confirmar acceso legítimo a Contexto Maestro y Planes Maestros, sin publicar material privado.
4. Ejecutar pruebas reales en versiones y permisos usados por el equipo para Codex, Claude Code y OpenCode. No simular uso de skills.
5. Comprobar reglas de rama required, rendimiento A/B, calidad de resultados, aprobaciones UI/UX y regresiones.
6. Integrar por PR revisado y autorizado, **conservando reglas de main hasta superar los gates**.

## Fuentes de la solución

- https://developers.openai.com/blog/eval-skills
- https://openai.com/index/harness-engineering/
- https://learn.chatgpt.com/docs/agent-configuration/agents-md
- https://claude.com/resources/articles/steering-claude-code-skills-hooks-rules-subagents-and-more
- https://opencode.ai/docs/instructions/
- https://opencode.ai/docs/skills/
- https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx
- https://www.sri.inf.ethz.ch/publications/gloaguen2026agentsmd
- https://fis.uni-bamberg.de/entities/researchdata/fad7bdfe-c39e-41d9-9540-80b703a02ea2

**Nota anti-sesgo:** existen estudios con resultados distintos sobre si AGENTS.md mejora eficiencia o éxito. Ninguna cifra externa sustituye un benchmark emparejado en Agua Bambú.
