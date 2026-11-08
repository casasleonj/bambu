# Acta de equivalencia, modificaciones y límites · PR #718

## Baseline y garantía mecánica

- El `AGENTS.md` original tenía 120.897 bytes, SHA de blob Git `4182d57064c7f89c2eea39e86d1e0b469179bb06`, 798 posiciones al dividir por saltos de línea.
- El repositorio modular conserva **seis partes originales literalmente**, sin reemplazar palabras, ordenar incidentes ni borrar contratos. El verificador `scripts/auditoria-agentes/check_modularizacion.py` reconstruye los bytes y exige la **misma SHA**. Esto prueba preservación documental y recuperabilidad del material fuente, **no** activación real.
- La matriz `matriz_fuente_798.csv` enlaza cada posición a una ruta real de archivo fuente y la URL del commit de origen. Conservar `PENDIENTE_REVISION_ATOMICA` para casos sin verificación semántica individual. Contar líneas no equivale a cobertura conductual.
- El núcleo operativo `AGENTS.md` se reduce deliberadamente y exige lectura dirigida de documentos y skills.

## Diferencias deliberadas y autoridad

| Ref fuente | Regla antigua | Resultado vigente propuesto | Clase | Justificación / prueba |
|---|---|---|---|---|
| AGENTS L1–L5, L667–L704 y .opencode/prompts/protocolo.txt | «tres iteraciones completas» *antes* del código, pero R3 de cada iteración implementaba | **R1+R2 ×3** antes de código; R3 solo tras aprobación de plan/fase | DECISIÓN PO **#704** (solicitada 2026-11-08; implementación pendiente de merge) | [protocolo-investigacion.md](../protocolo-investigacion.md), pruebas de términos y escenarios |
| AGENTS L7 | Maquetas escritorio/móvil y aprobación explícita antes de modificar UI | **Sin excepción**; estados confirmación/carga/error y diferencia backend/UI preservados | PRESERVADO | AGENTS §4 y tests de invariantes |
| AGENTS L9, L709–L711, L788–L790 | «Nunca apilar» vs stacked PRs documentados | Prohibido **apilamiento silencioso**; permitir excepciones documentadas si dependencia explícita | ACLARACIÓN POR ALCANCE | AGENTS §6, flujo-entrega |
| AGENTS L631–L639 | Tipado estricto «Sin any» | **Sin any**, incluidas formas `as any`, `any[]`, genéricos | PRESERVADO | AGENTS §5, reglas-codigo |
| AGENTS L640–L649 | «GPT/LLM previo: nunca» en jerarquía de pruebas | Una respuesta de LLM sin corroboración nunca es fuente probatoria. Las decisiones **humanas aprobadas** en conversaciones sí son evidencia primaria. | ACLARACIÓN DE AUTORÍA | AGENTS §1, reglas-codigo |
| AGENTS L713 | Flag OFF implica que merge es seguro | Mantener OFF cuando corresponda, pero verificar efectos no gobernados por flag | ACLARACIÓN DE RIESGO | flujo-entrega |
| AGENTS L750–L754 | Atajo de tests skipped implica ausencia cierta de regresión | Nunca garantizar ausencia de impacto sin comprobar config, imports, fixtures y build | ACLARACIÓN DE RIESGO | flujo-entrega |
| AGENTS L744 | Footer obligatorio «Generated with Claude Code» | Atribución veraz del ejecutor real; no atribuir a agentes que no hicieron el trabajo | CORRECCIÓN DE AUTORÍA | flujo-entrega |
| AGENTS L768–L770 | Revert inmediato como reparación universal | Respuesta inmediata y reversión compatible con migraciones y datos; no revert destructivo | ACLARACIÓN DE RIESGO | flujo-entrega |
| AGENTS L348–L624 | Known Issues mezclan bugs, decisiones, contratos, históricos | Referencias **literales** bajo índice, con clasificación por issue y código `main`; no afirmar resueltos por ubicación | REESTRUCTURACIÓN, NO REVOCACIÓN | historial-y-trazabilidad |
| AGENTS L17–L347 | Arquitectura y stack descritos como contexto global | Consulta selectiva del snapshot, verificación a SHA de `main` y docs de versión instalada | REESTRUCTURACIÓN, NO REVOCACIÓN | contratos-tecnicos |

## Responsabilidades por agente

- Codex: `AGENTS.md` y `.agents/skills/jl`, `.agents/skills/hallazgo`; lectura bajo demanda de módulos.
- Claude Code: `CLAUDE.md` importa el AGENTS raíz; referencias y `.claude/skills` presentes.
- OpenCode: `opencode.json` conserva compatibilidad; su prompt apunta a un protocolo único. Versión V1/V2 y posible duplicación necesitan prueba real.
- JL y Hallazgo **no se reescriben** ni se debilitan. Skills agnósticas se activan por intención, no por simple existencia.

## Gate de liberación no fingido

1. CI y paridad de archivo original: **verificable** mediante Python/GitHub Actions.
2. Documentación oficial y contrataciones: auditables con fuentes, límites de alcance e incidencias.
3. **Activación conductual de Codex, Claude Code y OpenCode:** `NO EJECUTADA` por ausencia de CLI/credenciales; crear trazas reales y evaluación A/B. No marcar `PASS` por tests de rutas.
4. Cobertura semántica atómica y decisiones de producto: la matriz previa no ha alcanzado equivalencia individual; conservar bloqueo y revisar.
5. `check_cutover.py` mantiene los gates de activación, aprobaciones e invariantes. No reemplazar estos resultados por evidencia inventada.

## Referencias externas verificables

- [OpenCode instrucciones raíz y anidadas](https://opencode.ai/docs/instructions/)
- [OpenCode skills y descubrimiento](https://opencode.ai/docs/skills/)
- [Agent Skills specification](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx)
- [Evaluación de skills](https://developers.openai.com/blog/eval-skills)
- [GitHub issues #704, #716](https://github.com/casasleonj/bambu/issues/704)

**Conclusión:** la integridad de la fuente y la resolución normativa de #704 están diseñadas y comprobables. La equivalencia de comportamiento entre agentes **sigue pendiente**. Hasta obtenerla, no tratar este PR como una liberación validada.
