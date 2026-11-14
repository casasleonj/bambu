# Guía de navegación de agentes · Agua Bambú

**Propósito:** ayudar a Codex, Claude Code, OpenCode y agentes compatibles a recuperar solo la evidencia necesaria, conservando las decisiones y el flujo ya establecidos.

## Lectura automática y lectura dirigida

- [`../../AGENTS.md`](../../AGENTS.md) contiene el **núcleo obligatorio**. No necesita cargar los otros archivos para comprender aprobaciones, riesgos, tipado y jerarquía.
- [`protocolo-investigacion.md`](protocolo-investigacion.md) es **canónico** para investigar, refutar, planificar y, solo con autorización, ejecutar R3. Resolución PO del problema #704.
- [`flujo-entrega.md`](flujo-entrega.md) es **canónico** para ramas, fases, CI, QA, migraciones, merge, integración y rollback.
- [`reglas-codigo.md`](reglas-codigo.md) conserva convenciones de código, fuentes y contrato de respuesta.
- [`presupuesto-y-contexto.md`](presupuesto-y-contexto.md) es **canónico** para coste: escalón más barato primero, el gasto alto se consulta al PO, patrón plan-caro/ejecución-barata, y cuándo y qué compactar sin perder contexto.
- [`contratos-saldo-favor-696.md`](contratos-saldo-favor-696.md) preserva **las decisiones de #691 y #696 añadidas en main después del snapshot original**, sin autorizar sus rebanadas futuras ni borrar el registro de fuente.
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
- **Research (ChatGPT):** [`../../.agents/skills/research-codex/SKILL.md`](../../.agents/skills/research-codex/SKILL.md). Enrutamiento obligatorio de ideas, funcionalidades por diseñar, investigaciones, casos adversariales, casos no contemplados, comparaciones y documentación con criterio. Comando `/research`. No autoriza implementar.

## Autoridad y conocimiento

1. El **Contexto Maestro vigente y los Planes Maestros aprobados** gobiernan producto. Documentos privados no aparecen automáticamente en GitHub público. Si no se pueden consultar legítimamente, reportar esa limitación, no reproducirlos en público.
2. El **código actual de `main`** gobierna el estado implementado; las notas de agosto u otras auditorías **no** demuestran qué está desplegado hoy.
3. Conversaciones históricas, incidentes y planes son evidencia y decisiones rastreables, no meras opiniones ni aprobaciones automáticas.
4. Especificaciones y skills de terceros son soporte de implementación, nunca sustituto de la autoridad del PO.
5. Fuentes externas y comunidad ayudan a investigar alternativas, no convierten patrones ajenos en reglas comerciales locales.

## Contratos locales junto al código

Se han colocado seis `AGENTS.md` acotados por directorio, en `src/app/api/`, `src/lib/`, `src/components/`, `src/modules/`, `prisma/` y `e2e/`. Incluyen criterios críticos de seguridad, dinero, UX, migraciones y QA extraídos del texto anterior y siempre sujetos a verificación en `main` y decisiones de producto.

Para Claude Code, `.claude/rules/*.md` usa `paths:` para indicar cuándo recuperar la guía local; para Codex/OpenCode los `AGENTS.md` anidados son los mecanismos nativos de instrucción por ámbito. Son mecanismos de **descubrimiento**, no prueba de obediencia. `scripts/auditoria-agentes/check_scoped_rules.py` verifica rutas y normas críticas, no rendimiento de agentes.

## Reconciliación semántica en curso

- [Catálogo de contratos con condiciones y excepciones](contratos-operativos.md), con vigencia aún por comprobar.
- [Reconciliación documentada del PR #718](auditoria-2026-11/RECONCILIACION_SEMANTICA_PR718.md), con pendientes diferenciados de cláusulas descompuestas.

- [Comparación puntual con código main](auditoria-2026-11/CONTRASTE_MAIN_VERIFICADO_PR718.md): 22 hallazgos técnicos con SHA, evidencia, limitaciones y distinción entre histórico y código.

## Invariantes de la reestructuración

El [snapshot original de seis partes](fuente-original/) conserva **todo el `AGENTS.md` anterior**, incluyendo el protocolo viejo que tenía el conflicto #704. Es **evidencia histórica** y no debe ser leído como autoridad paralela a las guías canónicas. El verificador CI exige identidad byte-a-byte de su concatenación respecto al blob Git `4182d57064c7f89c2eea39e86d1e0b469179bb06`.

Separar **contenido preservado** de **conducta realmente probada**: la equivalencia de bytes del snapshot no prueba que un agente haya cargado una referencia. La auditoría de activación continúa explícita.
