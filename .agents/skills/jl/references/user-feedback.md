# Objetivos, límites negativos y feedback sin entrevistas interminables

**Activación condicional:** cuando un resultado esperado, límite, comportamiento existente o aprobación material no pueda aclararse mediante la evidencia disponible. Aplica a INVESTIGAR, IMPLEMENTAR, VALIDAR, COMPLETO, LOTE e INSTALAR. **No activar como cuestionario obligatorio.**

## 1. Investigar antes de preguntar

Consultar solicitud, comentarios y conversaciones relevantes, decisiones aprobadas, pruebas existentes, contratos, pantallas y trazas. Distinguir hechos observados de deseos, suposiciones y prohibiciones explícitas. El agente investiga por su cuenta la causa técnica y las posibilidades existentes. Una respuesta dada previamente **no se vuelve a solicitar**; se referencia su fuente, alcance y vigencia. Las prácticas de empresas/comunidad son evidencia sobre alternativas, **no autoridad para deshacer una decisión de negocio confirmada**. Si se detecta contradicción material con una decisión existente, explicar el conflicto y preguntar solo cómo resolverlo; si la decisión no es accesible, no fingir que se conoce.

Formar internamente un **contrato de alcance compacto** (campos vacíos permitidos; no inventar):

| Campo | Significado | Ejemplo neutral |
|---|---|---|
| `QUIERE` | Resultado observable que se persigue | «Al guardar, el pedido se conserva» |
| `NO QUIERE` | Resultado prohibido o inaceptable expresamente indicado | «No duplicar pedidos ni cobros» |
| `PRESERVAR` | Comportamiento, datos, permisos o contratos existentes que deben seguir funcionando | «Los pedidos anteriores conservan su historial» |
| `FUERA DE ALCANCE` | Trabajo relacionado que se excluye o difiere; **no** es permiso de dañar | «No rediseñar el módulo completo» |
| `ACEPTACIÓN` | Ejemplos comprobables positivos y negativos; evidencia requerida | «Dos clics no generan dos registros» |
| `PENDIENTE` | Decisión sin fuente suficiente; bloqueante o no | «Sin decisión sobre pagos parciales» |

Anotar en cada límite importante: `origen = usuario explícito | regla documentada | observación del código | hipótesis`, `vigencia`, `criticidad`, `prueba`. Una regla inferida **no se presenta como deseo confirmado del usuario**. No suponer que «no se especificó» equivale a «autorizado». Los controles normales de integridad, privacidad, seguridad y regresión aplican incluso sin una lista de NO QUIERE.

## 2. Cuándo y cómo preguntar por lo que NO se quiere

1. Antes de preguntar, completar: «Sin conocer este límite, podría elegir A o B y el resultado sería materialmente distinto». Si la frase no se sostiene, **no preguntar**.
2. Elegir **una pregunta neutral y concreta** orientada a un conflicto observado, por ejemplo: «Al corregir [X], ¿qué debe mantenerse igual de [Y]?» o «¿Qué resultado de este caso sería inaceptable?». Si hay alternativas comprobadas, mostrar dos comportamientos y sus consecuencias, dando opción «ninguno» o «no sé».
3. Usar **ejemplos reales o hipotéticos marcados**, no una lista inventada de 20 cosas negativas: «Si se reintenta guardar, ¿debe evitarse crear otro registro?». Si el contrato vigente ya lo resuelve, no preguntar.
4. Agrupar **solo** 2–3 decisiones realmente dependientes en una ronda; preferir una sola. No es un límite rígido para casos de seguridad imprevistos, pero nuevas rondas necesitan **evidencia nueva y una decisión distinta**, no reformulaciones de la misma inquietud.
5. Registrar literalmente el sentido de la respuesta, fuente/aprobador, impacto y estado. Si el usuario no puede definir un límite, investigar con casos, código y prototipo; no insistir para que invente políticas técnicas.

**Anti-bucle y criterio de parada:** detener preguntas tan pronto existan (a) objetivo verificable, (b) límites críticos conocidos o protegidos por invariantes preexistentes, (c) criterios de aceptación suficientes para la decisión actual, (d) autorizaciones requeridas. No es necesario conocer todas las exclusiones del universo. Si aparece un riesgo **nuevo y material** después, reabrir *solo esa decisión*; si no hay respuesta a una cuestión bloqueante, pausar únicamente la acción afectada, continuar trabajo independiente y no sustituir silencio por aprobación. Para dudas no críticas, seguir el diseño más pequeño/reversible, etiquetar hipótesis y revisar en QA.

## 3. Ejemplos según modo, sin formularios

| Modo/caso | Pregunta positiva solo si falta | Pregunta negativa solo si cambia decisión |
|---|---|---|
| INVESTIGAR bug | «¿Qué intentaste hacer, qué pasó y qué esperabas?» | «Al corregirlo, ¿qué comportamiento actual debe continuar intacto?» |
| INVESTIGAR función nueva | «¿Qué tarea podrá terminar la persona?» | «¿Qué parte relacionada no debería incluir esta primera versión?» |
| UI/UX | «¿Qué resultado debe comprender y realizar el usuario?» | «¿Qué información o paso no debe desaparecer con la simplificación?» |
| Automatización | «¿Qué dato puede determinarse con certeza?» | «¿Qué decisión no debe tomar el sistema sin confirmación?» |
| IMPLEMENTAR | «¿Cuál de los dos resultados cumple la regla del negocio?» | «¿Se permite cambiar históricos o debe aplicarse solo a nuevos registros?» |
| VALIDAR | «¿Qué ocurrió al completar la tarea?» | «¿Hubo algún cambio o efecto que no esperabas?» |
| LOTE | «¿Esta regla se comparte en las unidades X, Y y Z?» | «¿En qué unidades NO aplica esta regla?» |
| INSTALAR | «¿Instalación por proyecto o global?» (si importa y no consta) | «¿Hay una instalación que deba preservarse y no sobrescribirse?» |

**Feedback neutral:** iniciar con una pregunta abierta, pasar a un caso concreto solo cuando haga falta. Evitar «¿verdad que esto es feo/confuso?» o «¿seguro que no quieres [lista de preferencias de la IA]?». Observar una tarea real cuando sea viable; una respuesta de intención no sustituye la conducta observada y un agente navegando no equivale a usuario humano.

## 4. Convertir negativos en aceptación y regresión

Por cada límite material, mapear `fuente → decisión → escenario → prueba/observación`. Ejemplos:

- **Positivo:** Dado un registro válido, cuando se guarda, entonces aparece una sola vez y puede recuperarse.
- **Negativo:** Dado el mismo intento repetido, cuando se reenvía, entonces no se producen registros o cargos duplicados.
- **Preservación:** Dado un histórico anterior, cuando entra el cambio, entonces conserva su valor y trazabilidad, salvo requisito contrario autorizado.
- **Fuera de alcance:** verificar que el PR no modifica el módulo excluido, sin usar la exclusión para omitir pruebas de regresión necesarias.

Comprobar los escenarios **durante implementación y QA**, por la capa apropiada (unitarias, integración, E2E, pruebas de usuario). Un límite no confirmado por usuario se valida como comportamiento existente comprobado o como hipótesis, no como «requisito aprobado». Defectos materiales reabren la investigación/corrección y las pruebas afectadas.

## 5. Trazabilidad compacta, lote y reanudación

Guardar por decisión, no por pregunta suelta: `ID(s) | QUIERE | NO QUIERE | PRESERVAR | FUERA DE ALCANCE | escenario crítico | fuente/estado | bloqueo | siguiente acción`. Incluir solo campos materialmente relevantes. Una decisión común a un lote se pregunta **una vez**, pero se verifica a qué IDs aplica; no imponer la regla a todos. Reanudar desde lo confirmado sin repetir preguntas. Aprobaciones de plan, UI, seguridad, merge o despliegue siguen separadas.

**No confundir:** «No queremos otra pantalla» (restricción), «no incluiremos reportes en esta versión» (no-objetivo), «no quiero un estilo específico» (preferencia) y «no deben perderse datos» (invariante de integridad). Los cuatro cambian decisiones de manera distinta.

**Fuentes metodológicas verificables:**
- Cucumber, Example Mapping: https://cucumber.io/docs/bdd/example-mapping/ (reglas, ejemplos, preguntas pendientes y elementos diferidos).
- Microsoft, feature-story design review: https://github.com/microsoft/code-with-engineering-playbook/blob/main/docs/design/design-reviews/recipes/templates/feature-story-design-review.md (Goals/Non-goals, riesgos, preguntas abiertas).
- Nielsen Norman Group, Avoid Leading Questions: https://www.nngroup.com/articles/leading-questions/ (neutralidad).
- Nielsen Norman Group, The Funnel Technique: https://www.nngroup.com/articles/the-funnel-technique-in-qualitative-user-research/ (de general a específico).
