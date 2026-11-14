> **ACTA HISTÓRICA PREVIA A LA REESTRUCTURACIÓN (#718).** Este documento refleja los gates/pendientes del análisis del 8 de noviembre **antes** de redactarse la solución de #704. No es una segunda política. La propuesta operativa aprobable está en [`AGENTS.md`](../../../AGENTS.md), [protocolo](../protocolo-investigacion.md) y [flujo de entrega](../flujo-entrega.md). La decisión #704 pasa a ser vigente solo al fusionar y verificar el PR correspondiente. El estado de las pruebas reales de agentes continúa sin certificarse.

# Conciliación normativa de instrucciones · Agua Bambú · 2026-11-08

> **PROPUESTA. No modifica AGENTS.md ni cambia políticas.** Baseline `main`: `50d3d69b18f4c9c4c5fa4ff14ca95045c3308c6c`. Blob de AGENTS: `4182d57064c7f89c2eea39e86d1e0b469179bb06`. Issue de la migración: #716.

## Criterio de autoridad

1. Producto: Contexto Maestro vigente + Planes Maestros aprobados + decisiones posteriores verificables; distinguir hechos, propuestas y pendientes. **El Contexto Maestro privado no está disponible automáticamente para los agentes del repo**. No publicarlo para resolver acceso.
2. Técnica: código de `main` a SHA, dependencias instaladas y pruebas; guías históricas no demuestran ejecución.
3. Flujo: obligaciones explícitas vigentes en AGENTS, y procedimientos y skills existentes, no una recomendación nueva de la IA.
4. Fuentes externas: contrastan técnicas y opciones, no reemplazan decisiones de Agua Bambú.
5. Un texto de una skill genérica no puede modificar normas del proyecto. Una decisión posterior del PO sí puede sustituir normas anteriores **si deja evidencia**.

## Conciliación por caso

| ID | Fuentes | Estado | Dictamen y medida segura | Gate |
|---|---|---|---|---|
| C01 | AGENTS L3–L5, L667–L703; .opencode/prompts/protocolo.txt | **CAMBIO NORMATIVO PENDIENTE** | «3 ciclos completos antes de código» entra en conflicto con R3 que ordena implementar. #704 ya propone R1/R2 por tres iteraciones, R3 tras autorización. No aplicar en silencio. Para investigaciones sin autorización: **no escribir código**, registrar estado bloqueado si el protocolo exige R3. | Decisión explícita PO sobre #704 |
| C02 | AGENTS L709–L711 y L785–L790 | **COMPATIBLE CON ALCANCE** | Se prohíbe el apilamiento silencioso, pero se permiten stacked PRs **explícitos y documentados** cuando una dependencia impide integrar antes. «una fase = una rama = un PR» sigue siendo el caso normal. | Trazabilidad de dependencia/base y pruebas al integrar |
| C03 | AGENTS L641–L649 («GPT/LLM previo, nunca»); Contexto Maestro | **COMPATIBLE POR TIPO DE FUENTE** | Un resultado generado por IA sin respaldo no es prueba. Los mensajes originales del usuario, decisiones aprobadas y Planes Maestros contenidos en conversaciones sí son fuentes históricas primarias. No degradar hechos humanos porque estén en chat. | Identificar autor, fecha, aprobación, alcance |
| C04 | AGENTS L744 (footer Claude Code) | **CAMBIO NORMATIVO PENDIENTE** | Codex/OpenCode no deben atribuirse un autor incorrecto. Proponer atribución al ejecutor real o campo neutral, manteniendo regla existente hasta autorización formal. | Aprobación PO/equipo |
| C05 | AGENTS L711–L715 (flag OFF «seguro») | **RIESGO TÉCNICO NO DEMOSTRADO** | OFF no demuestra ausencia de efectos en imports, SSR, jobs, migraciones ni API. Ante duda, no autorizar liberación solo por flag. | Tests de efectos directos/indirectos por SHA |
| C06 | AGENTS L750–L754 (atajo E2E) | **ALCANCE A VERIFICAR** | Nuevos specs con skip y fixtures intactas no prueban que no haya regresiones: considerar imports/config/build/side effects. Conservar baseline por firma y no declarar éxito sin evidencia. | Evaluación de riesgos E2E explícita |
| C07 | AGENTS L766–L770 (revert inmediato), L762–L765 (migración pre-merge) | **RIESGO TÉCNICO, REQUIERE PLAN** | Revert de Git no revierte migraciones ni datos. No automatizar reversión destructiva; preparar compatibilidad forward/backward, recuperación de datos y validación. | Reversibilidad/plan de incidente validado |
| C08 | .agents/skills/spec-driven-development/SKILL.md (specs son autoridad) | **CONFLICTO DE AUTORIDAD RESUELTO** | Una skill externa no desplaza Contexto Maestro/Planes aprobados. Specs ayudan a implementar y deben registrar brecha, no reescribir decisiones de producto a espaldas del PO. No activar automáticamente la skill sin finalidad comprobada. | Leer documento fuente antes de editar specs |
| C09 | docs/BACKLOG.md y workflow Backlog | **HECHO PARCIAL** | El workflow existe y exige referencias. **No está probado** que sea required check: endpoint de branch protection devolvió 403. No afirmar bloqueo de merge en UI. | Inspección de branch protection por autorizado |
| C10 | opencode.json y OpenCode autodetección AGENTS | **HIPÓTESIS** | Podría haber duplicación de instrucciones o deduplicación interna según versión. No quitar la entrada `instructions` sin comparar trazas/versión. | Test A/B OpenCode real |
| C11 | AGENTS L633 (tipado) | **PRESERVADO** | «Tipado estricto. Sin `any`». No permitir `as any`, `any[]` ni excepciones por conveniencia. | Prueba negativa |
| C12 | Histórico Known Issues L348–L624 | **PENDIENTE DE DESCOMPOSICIÓN** | No archivar como obsoletos todos los incidentes ni sustituir contratos por resúmenes. Cada registro mezcla observación, solución, regla y evidencia. | Matriz de significado/contrato e historia por unidad |

## Decisiones explícitas pendientes

- **#704:** qué significa «tres ciclos completos» para CONSULTAR, INVESTIGAR, IMPLEMENTAR y VALIDAR y cuántas aprobaciones aplican. **Estado actual: decision-PO, bloqueado**.
- Footer obligatoriamente Claude Code al crear PR desde un agente diferente: proponer atribución verdadera y neutral **antes de cambiarlo**.
- Almacenamiento/acceso autorizado al Contexto Maestro: no publicarlo en GitHub sin evaluación de confidencialidad.

## Restricciones durante esta fase

- No modificar AGENTS, protocolo OpenCode, reglas de PR, skills o CI en esta migración preparatoria.
- No fusionar el nuevo AGENTS v2 hasta tener equivalencia de obligaciones y pruebas **reales**.
- Las decisiones sin fuente quedan PENDIENTE; si hay conflicto normativo, no inferir aprobación del silencio.
- Todos los resultados deben referenciar SHA, condiciones y evidencias verificables.
