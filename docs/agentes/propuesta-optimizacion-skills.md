# Optimización de `hallazgo` y `jl` · propuesta y estado

**Fecha:** 2026-11-14 · **Estado:** P1, P2, P3, P4 y P5 **APLICADAS** (#806 para P1/P4, #807 para P2/P3/P5)
**Medición base:** tamaños y estructura leídos del repo a `main` @ d2e810fe.

## 1. Lo que medí

| Skill | Archivos | Tamaño | Estimación de carga |
|---|---|---|---|
| `hallazgo` | 3 | 16.2 KB | ~4.1k tokens si se leen los tres |
| `hallazgo` mínimo (SKILL.md) | 1 | 5.3 KB | ~1.3k tokens |
| `jl` completo | 15 | 129.5 KB | ~32k tokens |
| `jl` INVESTIGAR típico (5 refs) | 5 | 46.2 KB | ~11.5k tokens |
| `jl` + escenarios + comunicación | 7 | 74.1 KB | ~18.5k tokens |

Duplicación medida (n-gramas de 8 palabras compartidos entre archivos distintos):
**no hay copia literal**. El máximo solapamiento es 7 shingles entre
`verification-release.md` y `workflow.md`; el resto son 1–3. Es decir: el problema
**no es texto duplicado**, es densidad y repetición conceptual.

Repetición conceptual dentro de `jl/`:

| Concepto | Menciones |
|---|---|
| `XMOD` | 28 |
| `agent-browser` | 23 |
| `adversarial` | 14 |
| `QA de usuario` | 13 |
| `Context7` | 10 |
| `ESC-2` | 7 |
| `convergencia` | 6 |

Y el dato más caro: `jl/SKILL.md` tiene 35 líneas de contenido, de las cuales
**12 superan los 400 caracteres y la mayor llega a 1.013**. Es un muro de texto:
quien lo lee paga tokens y retiene poco. `hallazgo/SKILL.md` tiene el mismo patrón
(6 de 17 líneas por encima de 400 caracteres).

## 2. Qué está bien y no se toca

- La lógica de `jl` (modos, gates, ESC/XMOD/REUSE/DOC, estados) es sólida y no se
  propone cambiarla.
- La separación `SKILL.md` + `references/` ya es la correcta: es el mecanismo que
  permite cargar solo lo que se activa.
- `hallazgo` cumple su contrato (registrar sin implementar, con evidencia y sin
  duplicados) y su referencia de reproducción en navegador ya está alineada con
  `qa-navegador`.

Riesgo de empeorar: reescribir el contenido normativo de `jl` puede debilitar
gates. Por eso las propuestas son de **estructura y enrutamiento**, no de reglas.

## 3. Propuestas, por orden de retorno

### P1 — Índice de activación al inicio de `jl/SKILL.md` (alto retorno, riesgo bajo)

Añadir una tabla de ~10 líneas: «si la tarea es X, carga Y y no Z». Hoy las 13
referencias se mencionan dentro del texto corrido (2–4 veces cada una) y el agente
tiene que inferir cuáles aplican. Con el índice se evita cargar
`escenarios-impacto-usuario.md` (14 KB) para un cambio sin UI.

Ahorro estimado: evita 1–2 referencias por tarea → **4–10k tokens por tarea**.
No elimina ninguna regla.

### P2 — Partir las líneas-muro de `jl/SKILL.md` y `hallazgo/SKILL.md`

Convertir cada párrafo de 400–1.000 caracteres en una lista de 3–5 viñetas
atómicas. Mismo contenido, mismo orden, **misma longitud total**; lo que cambia es
la legibilidad y que las reglas se puedan citar por ítem en vez de «está en algún
sitio de ese párrafo».

No ahorra tokens de entrada, pero **reduce la relectura**: hoy un agente que
necesita comprobar un gate vuelve a leer el bloque entero porque no puede
localizarlo.

### P3 — `hallazgo` delega el QA de navegador en `qa-navegador`

`hallazgo/references/reproduccion-navegador.md` (57 líneas) y `qa-navegador/SKILL.md`
describen el mismo procedimiento desde dos ángulos: reproducir un reporte y validar
una implementación. Mantener los dos es deuda: al cambiar una regla hay que
cambiarla en dos sitios.

Propuesta: `reproduccion-navegador.md` conserva **solo** lo específico de
reproducción (el contrato `REPRODUCIDO / NO REPRODUCIDO / NO VERIFICADO / NO APLICA`,
el bloque del Issue, la regla de no escribir en producción) y **enlaza** a
`qa-navegador` para preflight, comandos y captura. Ahorro: ~1.5k tokens y una sola
fuente de verdad para el procedimiento.

### P4 — Declarar en `hallazgo` que no duplica a `jl`

Hoy nada impide que un hallazgo derive en implementación «de paso». Añadir dos
líneas: registrar ≠ implementar; si aparece un defecto durante el QA de una
implementación, se registra con `hallazgo` y se vuelve al ciclo de `jl`. Es la
regla que ya existe en `qa-navegador`, pero escrita donde se lee antes.

### P5 — Presupuesto en `jl` §6 (una línea, no un párrafo)

`jl` ya dice «no cortar controles críticos para ahorrar tokens», pero no dice cómo
gastar menos. Añadir una línea que remita a
`docs/agentes/presupuesto-y-contexto.md`: escalón más barato primero, el gasto alto
se consulta al PO. Sin duplicar la política.

## 4. Lo que NO propongo

- Fusionar `hallazgo` y `jl`: son responsabilidades distintas y la fusión cargaría
  siempre el doble.
- Acortar `references/` recortando reglas: el ahorro de tokens no justifica perder
  un gate.
- Meter `qa-navegador` dentro de `jl`: ya está enlazado y se activa solo cuando hay
  interfaz.
- Reescribir el texto normativo de una skill de terceros: `jl` es v2.13.0 y sus
  cambios de fondo se hacen en su paquete, no aquí.

## 5. Cómo se mediría el resultado

Sin medición no hay afirmación de ahorro. Antes y después, para 3 tareas reales
(un hallazgo UI, una corrección de backend, una funcionalidad con UI):

- bytes de skill cargados por tarea (suma de archivos leídos);
- número de relecturas del mismo archivo;
- si el agente acertó el modo (`INVESTIGAR` vs `IMPLEMENTAR`) sin preguntar.

Sin esos números, el ahorro queda como **no medido**.

## 6. Estado de aplicación

Autorizado por el PO el 2026-11-14 («dale», «decide tu y soluciona, aplica las
propuesta tambien»). Todo aplicado, nada pendiente de aprobación:

| Propuesta | Estado | Dónde |
|---|---|---|
| P1 índice de activación | aplicada | #806, `.agents/skills/jl/SKILL.md` §0 |
| P2 partir líneas-muro | aplicada | #807; línea máxima de `jl` 1.041 → 506, de `hallazgo` 673 → 454 |
| P3 delegar QA de navegador | aplicada | #807, `hallazgo/references/reproduccion-navegador.md` |
| P4 hallazgo no implementa | aplicada | #806, `hallazgo/SKILL.md` |
| P5 presupuesto en jl | aplicada | #807, remite a `docs/agentes/presupuesto-y-contexto.md` |

Añadido fuera de las cinco, pedido por el PO: **bucle de refutación hasta
converger** en `jl/SKILL.md` §4, con los estados y el criterio de parada delegados
en `convergence.md`.

**Sobre `jl` de terceros:** se editó la copia local del proyecto. No hay fork ni
propuesta upstream abierta; si el PO quiere que las mejoras P1/P2/P5 sobrevivan a
una actualización de JL, hay que proponerlas al paquete o mantener el parche
documentado.

**Lo que sigue sin medirse:** el ahorro real en tareas. Las cifras de este
documento son tamaños de archivo y longitudes de línea, no tokens consumidos en un
flujo completo.

Refs #804, #806, #807, #808.
