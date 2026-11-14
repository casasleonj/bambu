# Reparto de modelos y fases · Agentes (Agua Bambú)

**Estado:** propuesta operativa, no normativa de producto.
**Alcance:** qué CLI/modelo conviene usar en cada fase y **cómo se pasan la pelota los agentes**.
**No sustituye** `AGENTS.md`, `docs/agentes/protocolo-investigacion.md` ni `flujo-entrega.md`.
Si hay conflicto, manda `AGENTS.md`.

---

## 1. Principio: no hay memoria compartida

Claude Code, Codex y OpenCode guardan sus sesiones en sitios distintos e incompatibles:

| CLI | Almacén de sesión |
|---|---|
| Codex | `~/.codex/sessions/<año>/<mes>/<día>/rollout-*.jsonl` |
| Claude Code | `~/.claude/projects/<dir>/<uuid>.jsonl` |
| OpenCode | `~/.local/share/opencode/opencode.db` (`session`, `message`, `part`) |

Ninguno lee la sesión del otro y los IDs no viajan. **El canal de handoff son archivos
del repo, git y GitHub Issues/PRs.** Lo que no quede escrito en uno de esos tres medios
se pierde entre fases.

Consecuencia práctica: toda fase debe **dejar un artefacto con ruta conocida**. El
siguiente agente arranca leyendo ese archivo, no preguntando.

---

## 2. Reparto recomendado

| Fase | Modo JL | Quién | Modelo | Artefacto de salida |
|---|---|---|---|---|
| Descubrimiento / contraste (R1+R2, sin código) | `INVESTIGAR` | Codex o Claude | suscripción (GPT-6.1-Sol / Claude Sonnet) | `plan-<issue>.md` |
| Plan de implementación detallado | `INVESTIGAR` | OpenCode agente `plan` | `opencode-go/deepseek-v4-pro` | mismo archivo, sección *Plan* |
| Implementación | `IMPLEMENTAR` | OpenCode agente `build` | `opencode-go/glm-5.3-flash` | rama + commits |
| Volumen / tareas triviales | `IMPLEMENTAR` | OpenCode agente `build` | `opencode-go/deepseek-v4.1-flash` | rama + commits |
| QA / revisión independiente | `VALIDAR` | Codex o Claude (familia distinta al implementador) | suscripción | `qa-<issue>.md` |
| Registro de hallazgo | `Hallazgo` | cualquiera | cualquiera | Issue en GitHub |

### Medición que sostiene el reparto (no es preferencia)

Benchmark ejecutado en este repo, con verificador independiente del modelo:

- **Tarea simple** (crear `slug.ts` + tests, 3 asserts): `deepseek-v4.1-flash` 40s,
  `glm-5.3-flash` 36s, `kimi-k2.7-code` 42s, `mimo-v2.6-flash` 133s. Los cuatro **correctos**.
- **Tarea discriminatoria** (corregir suma en punto flotante a centavos enteros con redondeo
  simétrico, sin cambiar la API, + tests): `deepseek-v4.1-flash` 119s, `glm-5.3-flash` 94s,
  `kimi-k2.7-code` 83s. Los tres **7/7 asserts** y los tres resolvieron en centavos enteros.

Conclusión: `kimi-k2.7-code` **no se justifica** para build por defecto — cuesta 6× más que
`glm-5.3-flash` ($0.95/$4.00 vs $0.15/$0.50 por 1M) y en estas dos pruebas no superó a glm.
`glm-5.3-flash` fue además el que escribió la conversión monetaria más cuidadosa (parseo de
string decimal en vez de `Math.round(x*100)`, que falla en `1.005`). Queda como build por
defecto; `kimi-k2.7-code` se reserva para cuando glm falle y haya que escalar.


Reglas del reparto:

- **El revisor nunca es el implementador ni su misma familia de modelos.** Un modelo
  revisando su propio código tiende a aprobar su propio idiom.
- **La autoría se declara.** En el reporte de cada fase: `quién + modelo + ruta del
  artefacto`. Sin eso no se puede auditar la cadena.
- **Fase y modelo no son lo mismo.** `INVESTIGAR` es un modo de JL, no un modelo; dos
  agentes pueden investigar con modelos distintos y el artefacto se compara.

---

## 3. Presupuesto: por qué esos modelos y no otros

Cifras del plan **OpenCode Go ($10/mes)** — techo mensual **por modelo**, no global:

| Modelo | in/1M | out/1M | Techo/mes |
|---|---|---|---|
| `deepseek-v4.1-flash` | $0.15–0.30 | $0.60–1.20 | **$100** |
| `glm-5.3-flash` | $0.15 | $0.50 | $60 |
| `mimo-v2.6-flash` | $0.14 | $0.28 | $60 |
| `kimi-k2.7-code` | $0.95 | $4.00 | $60 |
| `deepseek-v4-pro` | $0.66–1.32 | $1.98–3.96 | **$15** |
| `kimi-k3` | $3.00 | $15.00 | $15 |

Lecciones:

1. **Go se mide en dólares por modelo, no en "tokens incluidos".** Agotar `deepseek-v4-pro`
   ($15) no afecta a `deepseek-v4.1-flash` ($100).
2. **El techo barato no siempre es el modelo barato.** `deepseek-v4.1-flash` es el de mayor
   techo *y* el más económico: por eso es el caballo de batalla para volumen.
3. **`glm-5.3-flash` es el mejor precio/rendimiento para build.** $0.15/$0.50 con techo de $60
   y, medido aquí, igual de correcto que `kimi-k2.7-code` que cuesta 6× más.
4. **`deepseek-v4-pro` sólo para planear.** Rinde mejor en razonamiento, pero su $15 se
   agota en ~500 requests: usarlo para programar es tirar el presupuesto del mes.
5. **DeepSeek tiene precio off-peak** (más barato fuera de hora pico).
6. **Máximo de requests/mes según la tabla de Go:** `glm-5.3-flash` 31.580,
   `deepseek-v4.1-flash` 216.670, `kimi-k2.7-code` 6.750, `deepseek-v4-pro` 5.200.
   Ese orden importa más que el precio por token cuando el uso es intensivo.

---

## 4. Cómo se consultan las decisiones entre agentes

En orden de autoridad, y todas ya existen en este repo:

1. `AGENTS.md` — núcleo obligatorio. `CLAUDE.md` lo importa (`@AGENTS.md`), así que Claude y
   Codex leen la **misma** fuente. Regla de 3 iteraciones R1+R2 antes de escribir código
   (resolución PO #704).
2. `docs/agentes/` — detalle canónico: `protocolo-investigacion.md` (R1/R2/R3),
   `flujo-entrega.md`, `reglas-codigo.md`, `contratos-tecnicos.md`,
   `contratos-saldo-favor-696.md`, `historial-y-trazabilidad.md` + `indice-historico-49.md`.
3. `AGENTS.md` anidados por ruta — `src/app/api/`, `src/lib/`, `src/components/`,
   `src/modules/`, `prisma/`, `e2e/`. Espejo para Claude en `.claude/rules/*.md` con
   `paths:`. **Son descubrimiento, no prueba de obediencia.**
4. `docs/BACKLOG.md` + **GitHub Issues** — backlog vivo. La regla se hace cumplir con
   `.github/workflows/backlog.yml`, no con la memoria de nadie.

Lo que **no** es un canal válido: "ya se lo dije al otro agente", una sesión de chat, o un
comentario en el transcript. Si no está en repo, git o Issue, no existe para el siguiente.

---

## 5. Handoff entre CLIs (patrón concreto)

```bash
# 1. Plan: escribe el archivo, no lo deja sólo en su sesión
codex exec 'Investiga el issue #NNN y escribe plan-NNN.md. No escribas código.'
#    o: opencode run --agent plan -m opencode-go/deepseek-v4-pro '...' --title plan-NNN

# 2. Implementación: arranca leyendo el plan
opencode run --agent build -m opencode-go/kimi-k2.7-code \
  'Implementa plan-NNN.md. Pruebas y typecheck. Commit en rama feat/NNN.'

# 3. QA: otro agente, otra familia
codex exec 'Revisa el diff contra plan-NNN.md. Reporta defectos con evidencia reproducible.'
```

El archivo del plan es lo que hace la fase portable entre herramientas y lo que el PO puede
leer en medio. Escribirlo siempre, aunque el agente pudiera retenerlo en su sesión.

---

## 6. Advertencias verificadas en este entorno

- `opencode run` imprime el modelo real en su primera línea (`> build · <modelo>`). **Ese es
  el dato**, no el flag que crees haber pasado ni el config que crees haber escrito.
- Los modelos fuera del plan Go fallan con `Insufficient balance` o `Model access is
  disabled`. No es un bug de configuración.
- `codex exec` en este repo emite `failed to load skill ... missing YAML frontmatter` para
  cualquier skill sin frontmatter; corregido en `spec-driven-development`.
- El script `scripts/auditoria-agentes/eval_runtime.py` informa
  `REQUIERE_REVISION_HUMANA_DE_TRAZAS`: **una traza no es una aprobación**. Su estado por
  defecto es `NO_EJECUTADO` y así debe reportarse.
- Archivo presente ≠ skill ejecutada. Tener `.agents/skills/jl` en el repo no prueba que un
  agente la haya cargado ni seguido.

---

## 7. Qué debe hacer cada agente al cerrar una fase

Reportar, siempre:

```
fase        INVESTIGAR | IMPLEMENTAR | VALIDAR
agente      codex | claude | opencode
modelo      <el que imprimió el CLI>
artefacto   ruta del archivo entregado
evidencia   pruebas realmente ejecutadas (no descritas)
estado      DISEÑO CONVERGIDO | IMPLEMENTADO | VALIDADO | QA PENDIENTE | BLOQUEADO
```

Sin esa ficha, la fase no se considera cerrada y el siguiente agente no debe asumir su
contenido.
