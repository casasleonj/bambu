# Política de presupuesto y contexto (estándar del proyecto)

**Qué es:** reglas para no quemar cuota de modelos ni contexto, sin perder potencia.
Aplica a cualquier agente (Claude Code, Codex, OpenCode, Hermes) y a cualquier
fase: research, implementación, QA, documentación.

**Base:** documentación oficial de Anthropic y OpenAI más patrones de comunidad,
consultados el 2026-11-14. Donde la comunidad no tiene consenso, se dice.

## 1. Escalón más barato primero (regla dura)

Nunca se arranca en el modelo caro. Se empieza en el escalón más bajo que pueda
hacer el trabajo y se sube **solo con una señal concreta**.

| Trabajo | Escalón |
|---|---|
| Extraer, ordenar, resumir, clasificar, renombrar, greps | el más barato + effort alto |
| Refactor pequeño, tests, plan claro ya aprobado | barato o medio + medium |
| Investigación que compara y refuta, redacción con criterio | `sol` + medium |
| Adversariales finos, fuentes contradictorias, invariantes entrelazadas | `sol` + high |
| Arquitectura, bug sutil, seguridad | **preguntar al PO antes** |
| `xhigh` / `max` / modelo tope de gama | **preguntar al PO antes**, siempre |

Señales que justifican subir (basta una, y se nombra):

1. Dos intentos en el escalón actual no convergen o se contradicen.
2. La respuesta ignora una restricción que ya estaba en el prompt.
3. Hay que razonar sobre varias invariantes a la vez (dinero, roles, offline).
4. El fallo es sutil y no se reproduce con la evidencia disponible.

## 2. El gasto alto se consulta, no se decide

Antes de usar el escalón caro se presentan opciones con su coste y una
recomendación. Se espera la respuesta.

```
Esto no converge en <modelo/effort actual>. Opciones:
 A) Seguir barato, más iteraciones — coste bajo, puede no resolver.
 B) Subir a <modelo>+<effort> solo para esta pregunta — coste alto, una vez.
 C) Partir el problema en preguntas más pequeñas en el barato — coste bajo, más tiempo.
Recomiendo C; si falla, B.
```

Prohibido: usar el modelo caro «por si acaso», para todo el flujo, o para tareas
mecánicas. Prohibido prometer ahorros sin medición: si no se midió, se dice
`sin medir`.

## 3. El patrón que ahorra de verdad: plan caro, ejecución barata

Documentado por Anthropic (`/model opusplan`: Opus planifica, Sonnet implementa) y
repetido por la comunidad como el patrón que mejor relación coste/calidad da:

1. **Planificar** en el escalón alto: descomponer, decidir límites, escribir el
   plan con tareas atómicas y criterios de aceptación.
2. **Ejecutar** en el escalón bajo: seguir el plan. Si el plan no deja ambigüedad,
   la ejecución es barata.

Falla cuando el plan tiene huecos: el modelo barato no detecta la ambigüedad que
hereda y el arreglo cuesta más que el ahorro. Por eso el plan se escribe con
criterios verificables, no con deseos.

## 4. Cuándo compactar la conversación

**No hay umbral oficial ni consenso comunitario.** Lo que sí está documentado:

- Anthropic recomienda compactar **con instrucciones de enfoque** antes de una
  tarea larga, no cuando ya se agotó la ventana.
- La comunidad se reparte entre resumir al 40–50 %, intentar terminar al 70 %, o
  dejar el automático. Son preferencias declaradas, no umbrales validados.

Estándar de este proyecto (decisión, no consenso):

| Situación | Acción |
|---|---|
| Se va a empezar una tarea grande o un lote | **compactar antes**, con la instrucción de qué preservar |
| La sesión ya no aporta contexto nuevo y sigue | compactar y continuar |
| Se cambia de issue o de módulo | cortar con `/new` o `/clear`, no arrastrar |
| Se cierra una fase | escribir la ficha de cierre y empezar limpio |

Umbral operativo: **compactar al acercarse al 50 % de la ventana**, que es el
valor por defecto de Hermes (`compression.threshold: 0.50`) y deja margen para la
tarea en curso. No se espera al 90 %.

## 5. Qué preservar y qué tirar al compactar

Preservar (si falta, el trabajo se rehace y se gasta el doble):

- Decisiones tomadas y **por qué**, con quién las aprobó.
- Invariantes y restricciones (`QUIERE` / `NO QUIERE` / `PRESERVAR`).
- Rutas, archivos y símbolos ya tocados.
- Estado real: **terminado / en curso / pendiente / bloqueado**, sin mezclar.
- Números de issue, PR, SHA y comandos exactos que funcionaron.

Tirar:

- Hipótesis descartadas y callejones sin salida.
- Salidas de herramientas ya resumidas y transcripciones repetidas.
- Relecturas del mismo archivo.

Errores que la comunidad reporta al compactar mal, y que aquí se evitan:

- Instrucciones debilitadas u omitidas → se re-inyectan las invariantes.
- Trabajo terminado que «reaparece» pendiente → la ficha de estado es explícita.
- Alucinación de estado tras compactar → se verifica contra git y los issues, no
  contra el recuerdo de la conversación.

## 6. Higiene de contexto en cada turno (más barato que compactar)

- No leer archivos enteros para buscar una función: localizar el símbolo primero.
- No repetir la misma búsqueda ni la misma pregunta al modelo.
- Cargar una referencia de skill **solo cuando se activa**, no por defecto.
- Pasar al modelo el fragmento relevante, no el archivo completo.
- Reutilizar la evidencia ya recogida en el issue o el PR en vez de volver a
  investigarla.

## 7. Lo que no se puede confirmar

- Un porcentaje de ahorro universal entre niveles de effort.
- Una cadencia de compactación «óptima» por número de turnos.
- Compactación sin pérdida de contexto: no existe; por eso se preserva lo de §5.

Fuentes: configuración de modelos y effort de Anthropic y OpenAI; guía de
compaction de OpenAI; ingeniería de contexto de Anthropic; hilos de comunidad sobre
`opusplan` y sobre cuándo compactar (2026-11-14). Las cifras de comunidad no se
reproducen aquí como hechos.
