# Correcciones a eval_runtime.py · 2026-11

**Archivo:** `scripts/auditoria-agentes/eval_runtime.py`
**Motivo:** el evaluador producía evidencia falsa en dos direcciones — reportaba 0 activaciones
cuando sí las hubo (opencode) y contaba intentos fallidos como lecturas (codex).

---

## Los cuatro defectos

### 1. `CODEX_HOME` apuntaba a un directorio inexistente

`fixture()` creaba `HOME` pero escribía `CODEX_HOME=$HOME/.codex` sin crear ese directorio.
Codex aborta antes de arrancar:

```
CODEX_HOME points to "/tmp/ab-eval-xxx/_sandbox_home/.codex", but that path does not exist
```

Resultado: **21/21 casos en `FALLO_EJECUCION` con exit 1**, indistinguible de "el agente no
activó la skill". Corregido con `(home/".codex").mkdir(parents=True, exist_ok=True)`.

### 2. El aislamiento de `HOME` dejaba al CLI sin credenciales

Con `HOME` vacío no hay `auth.json`, así que codex responde:

```
401 Unauthorized: Missing bearer or basic authentication in header
```

El evaluador lo habría leído como fallo del agente cuando el fallo era del arnés. Se añadió
`seed_auth()`, que copia **sólo** el archivo de credenciales de cada CLI con `chmod 0600`:

| CLI | Origen | Destino en el sandbox |
|---|---|---|
| codex | `~/.codex/auth.json` | `<home>/.codex/auth.json` |
| claude | `~/.claude/.credentials.json` | `<home>/.claude/.credentials.json` |
| opencode | `~/.local/share/opencode/auth.json` | `<home>/.local/share/opencode/auth.json` |

Nunca se copian MCPs, plugins, hooks ni el resto de la configuración global: el aislamiento se
mantiene. Cada resultado declara `credenciales_sembradas` para que el efecto quede en la traza
y no sea magia invisible.

### 3. `scan_tool_calls` no entendía ningún envoltorio real

La función buscaba `tool_name`/`toolName` en la raíz del evento con un walker genérico. Los
tres CLIs anidan nombre e input:

```json
{"type":"tool_use","part":{"type":"tool","tool":"read","state":{"input":{"filePath":"..."}}}}
{"item":{"type":"command_execution","command":"/bin/bash -lc 'cat .../SKILL.md'","exit_code":1}}
{"item":{"type":"mcp_tool_call","tool":"github.fetch_file","arguments":{...}}}
```

Por eso **todos** los casos salían `eventos_skill: []`, incluso cuando el agente había leído el
`SKILL.md`. Corregido soportando los tres envelopes.

### 4. Contaba intentos como lecturas

Éste es el que importa. En este entorno `bwrap` está denegado:

```
bwrap: No permissions to create a new namespace
```

Así que `cat .agents/skills/jl/SKILL.md` sale **exit=1 y sin salida**. Además el evento
`item.started` trae `exit_code: null` porque aún no ejecutó nada. Un parser ingenuo cuenta los
dos como evidencia y produce **7 activaciones falsas en codex**.

Regla implementada: sólo `exit_code == 0` **con salida no vacía** cuenta como lectura. Lo demás
se etiqueta `intento-fallido`, que se reporta pero no computa como activación.

---

## Efecto medido

Sobre las mismas 10 trazas de codex y 5 de opencode ya en disco:

| CLI | Antes | Parser corregido, sin regla 4 | Final |
|---|---|---|---|
| codex | 0 evidencias | 7 "evidencias" (falsas) | **0 reales, 7 intentos bloqueados** |
| opencode | 0 evidencias | 2 | **2 reales** (`skill-tool`) |

Las 2 de opencode sí son activación: llamó al tool nativo `skill` con `{"name":"hallazgo"}`,
no sólo abrió el archivo.

---

## Efecto por estado de caso (corrida codex, 21 casos)

- `FALLO_EJECUCION` 21/21 → `TRAZA_PARA_REVISION` 21/21
- `credenciales_sembradas: [".codex/auth.json"]` presente en cada caso

---

## Lo que este arreglo NO resuelve

1. **El sandbox del repo sigue roto para codex.** `bwrap` no funciona sin
   `kernel.unprivileged_userns_clone=1`; codex no puede leer archivos locales y se va a GitHub
   por MCP. Por eso codex aparece con 0 activaciones aunque *intentó* leer 7 veces. Eso no es
   un defecto del evaluador: es una limitación del entorno que el reporte debe declarar.
2. **`REQUIERE_REVISION_HUMANA_DE_TRAZAS` sigue siendo el estado correcto.** Una traza con
   `read-skill` prueba que se abrió el archivo, no que el agente obedeció su contenido.
3. **`TIEMPO_AGOTADO`** en casos largos con `--timeout` bajo no es un fallo del agente; hay que
   subir el timeout o reducirlo aparte.
