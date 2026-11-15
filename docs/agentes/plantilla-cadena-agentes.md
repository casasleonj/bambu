# Plantilla: declaración de cadena de agentes en el PR

Pegar en el cuerpo del PR. `scripts/auditoria-agentes/check_cadena_agentes.py` lo
valida y el job `Agent Instructions Audit` lo ejecuta. Sin este bloque el PR no
puede declararse revisado: es la diferencia entre «un agente dijo que está bien» y
«se puede auditar quién lo dijo».

```markdown
<!-- cadena-agentes
investigacion:
  agente: codex
  modelo: gpt-6.1-sol
  artefacto: docs/agentes/plan-<issue>.md
  fuentes_externas: 4
implementacion:
  agente: opencode
  modelo: glm-5.3-flash
  familia: glm
  artefacto: <sha del commit o rama>
auditoria:
  agente: claude
  modelo: claude-sonnet-5-5
  familia: anthropic
  artefacto: /tmp/auditoria-<issue>.log
qa_navegador:
  agente: claude
  modelo: claude-sonnet-5-5
  herramienta: agent-browser
  artefacto: /tmp/qa-<issue>-<pantalla>.png
-->
```

## Reglas que el verificador aplica

| Regla | Por qué |
|---|---|
| `implementacion` y `auditoria` son obligatorias | Un cambio sin revisor independiente es un autoinforme |
| Cada fase declara `agente`, `modelo` y `artefacto` | Sin los tres no se puede auditar la cadena |
| `auditoria.agente` ≠ `implementacion.agente` | El revisor nunca es el implementador |
| `auditoria.familia` ≠ `implementacion.familia` | Misma familia aprueba su propio idiom |
| `qa_navegador.herramienta` ∈ {agent-browser, playwright, playwright-mcp, obscura} | Una promesa no es evidencia |
| `investigacion.fuentes_externas` > 0 o `alcance: solo-interno` | Investigar es research; leer el repo no basta |

## Cuando no hay QA de navegador

Omitir la fase `qa_navegador` entera. No declararla con `herramienta: manual`
ni con un artefacto inventado: el verificador lo rechaza, y con razón.

## Cuando la investigación fue solo reconocimiento interno

```markdown
investigacion:
  agente: codex
  modelo: gpt-6.1-sol
  artefacto: docs/agentes/plan-<issue>.md
  fuentes_externas: 0
  alcance: solo-interno
```

Es válido, pero queda escrito: nadie puede confundirlo después con research.
