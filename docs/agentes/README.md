# Guía de navegación de agentes · Agua Bambú

**Propósito:** ayudar a Codex, Claude Code, OpenCode y agentes compatibles a recuperar solo la evidencia necesaria, conservando las decisiones y el flujo ya establecidos.

## Lectura automática y lectura dirigida

- [`../../AGENTS.md`](../../AGENTS.md) contiene el **núcleo obligatorio**. No necesita cargar los otros archivos para comprender aprobaciones, riesgos, tipado y jerarquía.
- [`protocolo-investigacion.md`](protocolo-investigacion.md) es **canónico** para investigar, refutar, planificar y, solo con autorización, ejecutar R3. Resolución PO del problema #704.
- [`flujo-entrega.md`](flujo-entrega.md) es **canónico** para ramas, fases, CI, QA, migraciones, merge, integración y rollback.
- [`reglas-codigo.md`](reglas-codigo.md) conserva convenciones de código, fuentes y contrato de respuesta.
- [`contratos-tecnicos.md`](contratos-tecnicos.md) dirige a las decisiones técnicas documentadas, versión y verificación con `main`.
- [`indice-historico-49.md`](indice-historico-49.md) indexa 49 registros históricos con sus anclas (los números 13, 43 y 45 se repiten).
- [`historial-y-trazabilidad.md`](historial-y-trazabilidad.md) dirige a 49 bloques de incidentes y contratos históricos, sin declarar automáticamente obsoleto o vigente ninguno.
- [`auditoria-2026-11/`](auditoria-2026-11/README.md) contiene matriz, evidencia, limitaciones de pruebas por agente y gate, no es documento normativo.

## Skills existentes

- **JL:** [`../../.agents/skills/jl/SKILL.md`](../../.agents/skills/jl/SKILL.md). Selección de INVESTIGAR, IMPLEMENTAR, VALIDAR, COMPLETO, LOTE, instalación; ESC/SYN/XMOD/REUSE/DOC, escenarios y progresos. Sus referencias solo se leen en el momento pertinente.
- **Hallazgo:** [`../../.agents/skills/hallazgo/SKILL.md`](../../.agents/skills/hallazgo/SKILL.md). Registro de incidencias y funcionalidades con deduplicación, prioridad y privacidad; registro **no** equivale a implementación.
- **Claude Code:** `CLAUDE.md` importa `AGENTS.md`, y las skills .claude son compatibles con el repositorio; no asumir que el enlace se ejecutó por existir.
- **OpenCode:** `opencode.json` carga reglas del repo; `.opencode/prompts/protocolo.txt` apunta a un único protocolo canónico en vez de mantener una implementación contradictoria.
- **Codex:** usa `AGENTS.md` en raíz y `.agents/skills/`; para evidencia conductual real se necesitan registros de CLI.

## Autoridad y conocimiento

1. El **Contexto Maestro vigente y los Planes Maestros aprobados** gobiernan producto. Documentos privados no aparecen automáticamente en GitHub público. Si no se pueden consultar legítimamente, reportar esa limitación, no reproducirlos en público.
2. El **código actual de `main`** gobierna el estado implementado; las notas de agosto u otras auditorías **no** demuestran qué está desplegado hoy.
3. Conversaciones históricas, incidentes y planes son evidencia y decisiones rastreables, no meras opiniones ni aprobaciones automáticas.
4. Especificaciones y skills de terceros son soporte de implementación, nunca sustituto de la autoridad del PO.
5. Fuentes externas y comunidad ayudan a investigar alternativas, no convierten patrones ajenos en reglas comerciales locales.

## Invariantes de la reestructuración

El [snapshot original de seis partes](fuente-original/) conserva **todo el `AGENTS.md` anterior**, incluyendo el protocolo viejo que tenía el conflicto #704. Es **evidencia histórica** y no debe ser leído como autoridad paralela a las guías canónicas. El verificador CI exige identidad byte-a-byte de su concatenación respecto al blob Git `4182d57064c7f89c2eea39e86d1e0b469179bb06`.

Separar **contenido preservado** de **conducta realmente probada**: la equivalencia de bytes del snapshot no prueba que un agente haya cargado una referencia. La auditoría de activación continúa explícita.
