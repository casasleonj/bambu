# Comunicación útil, ejemplos cotidianos y progreso verificable

**Cuándo cargar:** cualquier tarea JL con usuario humano; leer al preparar el primer aviso, el dictamen o una maqueta, y volver a consultar solo si hay QA prolongado, lote, bloqueo o evaluación de agentes. **No** depende de Agua Bambú, de una interfaz gráfica ni de un mecanismo especial de terminal. Las instrucciones del proyecto prevalecen. Esta guía regula la comunicación, **no autoriza** cambios, merges ni despliegues.

## Contrato de comunicación: explicar el resultado, no solo la actividad

Cada actualización significativa debe resolver, con la menor extensión razonable, estas preguntas:

1. **Dónde estamos:** fase/subfase en curso y estado real (`INICIÓ`, `EN CURSO`, `TERMINÓ`, `CON FALLOS`, `PENDIENTE`, `BLOQUEADO`, `REABIERTO`).
2. **Qué aprendimos o comprobamos:** hallazgo o hecho respaldado; distinguir diagnóstico, propuesta, cambio aplicado y prueba ejecutada.
3. **Por qué importa para la persona:** tarea cotidiana que mejora, error que se evita, funcionalidad preservada; si no se sabe, decirlo.
4. **Qué sigue o qué necesita aprobación:** siguiente hito concreto, decisión y límite. No pedir permisos ya concedidos.

**Estilo:** español sencillo si la conversación es en español, cálido y profesional; verbos concretos, primera persona natural, máximo un emoji funcional por hito si aporta orientación (`🔎 🛠️ 🧪 🧭 🎨 ✅ ⚠️ ⏸️ 🔁`). Encabezados breves opcionales. Evitar mensajes telegráficos vacíos, metáforas forzadas, fanfarrias, porcentajes ficticios y tecnicismos como única explicación. Una o dos frases en actualizaciones; mayor detalle en aprobaciones, informes y bloqueos significativos. **Mensaje humano primero; rutas, logs y métricas después**, cuando aporten valor.



**Para cambios con consecuencias en otros pasos, presentar el mapa ESC-2 ANTES del plan final, no solo un ejemplo.** Agrupar por tareas reales, controles/botones, siguientes transacciones, historial y reversión; mostrar también lo descubierto sin que el usuario lo pidiera. Distinguir `CONFIRMADO/PROPUESTO/PENDIENTE/NO_APLICA/NO_VERIFICADO` e invitar a señalar omisiones sin convertirlo en una encuesta. [escenarios-impacto-usuario.md](escenarios-impacto-usuario.md).
### Ejemplo cotidiano obligatorio cuando se presenta o recomienda una solución

En **el plan comprensible**, **la propuesta de UI/UX** si aplica, **una decisión de negocio difícil** y **el cierre final**, incluir al menos **un caso breve** con esta estructura flexible:

- **Antes:** qué intenta hacer una persona y qué dificultad encuentra, en términos cotidianos.
- **Cuando:** qué acción realiza, con una cantidad/estado de ejemplo cuando ayude.
- **Después:** qué vería o qué resultado obtendría con la solución propuesta.
- **Qué se preserva / qué no ocurrirá:** una restricción o escenario adversarial relevante, si aplica.

Usar ejemplos **basados en el comportamiento comprobado del producto**, o rotularlos explícitamente `Ejemplo hipotético` cuando el comportamiento o las cifras sean ilustrativos. No transformar el ejemplo en una afirmación sobre producción. **Si se trata de investigación**, decir «con la solución propuesta ocurriría…», nunca «ya ocurre…». **Si falta un dato**, formular condicional o indicar pendiente. No asumir que dos métricas deban coincidir sin contrato semántico (XMOD). No fabricar usuarios, testimonios, descuentos, errores, importes, tiempos, porcentajes ni aprobaciones.

**Ejemplo hipotético de conciliación de métricas:** «Ana abre el cierre y ve $100.000 en ventas. Luego abre el tablero y ve $105.000 para las mismas ventas y el mismo día. Investigaremos si ambos realmente usan la misma definición, los mismos filtros y el mismo corte. Si deben ser iguales, corregiremos la fuente de la diferencia; si uno incluye cobros de días anteriores, lo explicaremos en lugar de alterar una cifra». **No implica que existan esos valores en la base real.**

**Ejemplo hipotético de doble envío:** «Un vendedor toca Guardar dos veces porque la conexión está lenta. Después debería aparecer un solo pedido, nunca dos». Acompañar con la prueba de reintento y la regla vigente; no prometer idempotencia sin haberla implementado/verificado.

**Ejemplo de UI propuesto:** «Antes hay que abrir tres pantallas para revisar una entrega; con la maqueta propuesta, los datos necesarios quedan visibles en una. El usuario todavía confirma antes de registrar un cobro». Solo si fue medido o propuesto con ese alcance. No afirmar que se redujeron clics hasta observar el flujo.

En cambios triviales, basta un antes/después de una oración. En tareas sin impacto visible, explicar qué fallo técnico previene, sin analogías decorativas. No repetir el mismo ejemplo completo en cada actualización; reutilizar su identificador o referirse al resultado.

### Intensidad adaptable, sin ruido ni gasto de tokens

- **Trabajo breve:** un mensaje inicial cuando haga falta y un cierre con evidencia; los hitos instantáneos pueden condensarse.
- **Trabajo complejo/extendido:** iniciar/cerrar cada fase **al ocurrir realmente**, compartir hallazgos de alto valor, cambios de rumbo, bloqueos, solicitudes de aprobación y progresos intermedios significativos. En una etapa prolongada sin hallazgos, comunicar la actividad concreta siguiente sin inventar avance.
- **LOTE:** actualizaciones agregadas por grupos y excepciones. Mostrar `issues inspeccionados i/N`, `pruebas ejecutadas j/M` solo si el denominador se conoce y los contadores proceden de resultados reales.
- Si el usuario pide frecuencia/formato concretos, respetarlos dentro de las herramientas disponibles. Evitar mensajes redundantes con el panel de tareas, trazas o logs que ya ve.
- **Nunca inventar** barra de progreso, duración, ETA, porcentaje, cantidad de tests ni verificación de artefactos. Si un conteo es cambiante o desconocido, usar nombres de hitos en lugar de cifras.

## Eventos y mensajes adaptables por etapa

Los siguientes son **ejemplos ilustrativos, no evidencias de ejecución**. Cambiar siempre los detalles según lo observado y su certeza:

| Evento real | Comunicación breve, con valor para la persona |
|---|---|
| Inicio INVESTIGAR | `🔎 Revisaré por qué el total cambia entre pantallas y qué otras cifras usan ese cálculo. Primero verificaré las definiciones, para no corregir el número equivocado.` |
| Hallazgo intermedio | `Encontré dos consultas que calculan el mismo indicador por caminos distintos. Aún estoy comprobando si incluyen exactamente los mismos registros.` |
| Fin INVESTIGAR | `✅ Identifiqué la causa con evidencia. La propuesta es unificar la regla compartida y comprobar cierre, tablero y exportación; todavía no he modificado el código.` |
| Gate de aprobación | `Necesito aprobar esta decisión: conservar el filtro actual o ampliar el período. La elección cambia los totales históricos; ninguna opción se aplicó aún.` |
| Inicio IMPLEMENTAR | `🛠️ Aplicaré el cambio aprobado en la fuente compartida y revisaré sus consumidores; los registros históricos permanecerán intactos salvo autorización.` |
| Progreso IMPLEMENTAR | `La regla central ya quedó adaptada. Estoy verificando que los reportes existentes no sigan usando la fórmula anterior.` |
| Fin IMPLEMENTAR | `✅ La corrección está aplicada en el código. Las comprobaciones locales ejecutadas se adjuntan; falta validar el comportamiento integral.` |
| Inicio VALIDAR | `🧪 Voy a contrastar casos normales, anulaciones y valores mostrados en las secciones afectadas.` |
| Fallo y reintento | `⚠️ Detecté que el tablero conserva un valor antiguo después de anular. No daré la validación por aprobada: revisaré la actualización de datos y repetiré la prueba.` |
| Fin VALIDAR con evidencia | `✅ Los escenarios exigibles se comprobaron con estos resultados y evidencias. El issue queda [APTO/BLOQUEADO] según aprobaciones y pruebas pendientes.` |
| Bloqueo | `⏸️ No hay un navegador o entorno de prueba utilizable. Pude ejecutar estas pruebas técnicas, pero la validación visual sigue pendiente.` |

**No confundir:** terminar la investigación no significa aprobar el plan; terminar implementación no equivale a CI verde; terminar pruebas con fallos no equivale a VALIDADO.

## 🎨 Maquetas y revisión de UI/UX

Si el cambio exige maqueta/aprobación, comunicar **cuatro estados diferenciados**:

1. `🎨 Diseño en preparación`: qué tarea se rediseña, perfiles/dispositivos/estados que se cubrirán; no simular una maqueta ya construida.
2. `🎨 Maqueta disponible para revisión`: **mostrar o enlazar un artefacto real existente**, explicar el recorrido cotidiano antes/después, estados de carga/error/vacío, móvil/escritorio y lo que permanece igual; señalar qué decisiones necesitan aprobación.
3. `⏸️ Pendiente de aprobación`: no interpretar silencio como aprobación; si el PO aprueba solo una variante o capa, delimitarlo.
4. `✅ Maqueta aprobada` **solo con evidencia de aprobación explícita**; luego anunciar implementación según permisos. Después, validar que la interfaz implementada respeta la maqueta aprobada.

No sustituir una maqueta por texto y asegurar que se mostró visualmente. Si no se generó artefacto, decir «propuesta textual» y explicar la limitación. Evitar imágenes falsas que pretendan representar la aplicación actual.

## 🧪 Pruebas: diferenciar lo que se está ejecutando

- **Pruebas técnicas/unitarias/integración/CI:** indicar qué contrato se comprueba y resultado real. Ejemplo: «Estoy verificando que al repetir Guardar no se creen duplicados». Si el CI solo arrancó, no declarar tests ejecutados o correctos.
- **Playwright Test:** anunciar inicio **solo al ejecutarse la suite**; durante la ejecución dar hitos por grupo/flujo y resultado (`pasaron`, `fallaron`, `omitidas`, `flaky`, `reintentadas`). Reportero/trace/CI respaldan los números; si una suite falla, anunciar la función afectada, no pegar el log completo. Una suite con 4 shards requiere distinguir shards ejecutados de aprobados.
- **`agent-browser` / navegador autónomo:** anunciar inicio **solo al abrir y navegar la aplicación**. Explicar la tarea humana recorrida (p. ej. «abrir pedido → revisar datos → guardar → volver y comprobar»), rol, móvil/escritorio y problemas de legibilidad, estados, enlaces y persistencia. La apertura de la herramienta no prueba que se completó el recorrido. Capturas, snapshots y resultados sustentan el reporte. No atribuirle aserciones de Playwright ni llamar «usuario humano real» al agente.
- **Subagentes de investigación o revisión:** si se usan realmente, comunicar su misión y el resultado que cambie la decisión (por ejemplo «una segunda revisión encontró una regresión de permisos»), no emitir un mensaje por cada creación, herramienta o respuesta; no simular trabajo paralelo ni atribuir verificaciones inexistentes.
- **Evaluación de la propia skill/agente:** distinguir **casos de evaluación escritos**, **pruebas estáticas del paquete**, **ejecuciones reales con el agente** y **verificación de conducta**. Decir p. ej. «185 escenarios definidos, 0 ejecutados con Codex» si es el dato real. No declarar éxito conductual porque el YAML existe o un validador pasó.
- **Regresión transversal XMOD:** nombrar primero las secciones/contratos afectados y actualizar el estado por consumidor. Ejemplo: «Cierre comprobado; Dashboard pendiente; exportación falló por filtros diferentes». No confundir cifras comparables con métricas distintas.

**Formato de cierre útil:** `qué se probó | qué pasó | evidencia | qué sigue`, junto con resumen por resultados. Si son muchas pruebas, mostrar el total agregado y 1-3 anomalías importantes, con enlace al informe completo. No redactar una notificación por cada clic/test.

## Seguridad, accesibilidad y honestidad

- **Emociones:** tono cercano sin condescendencia, exageración ni humor en incidentes de datos, seguridad o pérdidas económicas. El color y los emojis no reemplazan el estado escrito.
- **Contexto:** si el usuario no es técnico, explicar el resultado y después ofrecer rutas/SHA; si es técnico, permitir detalles, sin ocultar riesgos.
- **Aprobaciones:** maquetas, plan, merge, producción y uso de herramientas externas conservan sus controles independientes.
- **Pruebas de accesibilidad:** las capturas no demuestran accesibilidad ni usabilidad humana; pruebas automatizadas y revisión real son complementarias.
- **Canales:** usar la presentación que soporte el cliente real (Markdown/estado del agente/artefactos reales). No inventar widgets, barras animadas, notificaciones push, hooks o integraciones que no existan. Un output textual honesto es preferible a una UI teatral.

## Referencias verificables de diseño de comunicación

- Nielsen Norman Group, visibilidad del estado: https://www.nngroup.com/articles/visibility-system-status/
- Nielsen Norman Group, progreso en tareas: https://www.nngroup.com/articles/progress-indicators/
- Cucumber, Example Mapping: https://cucumber.io/docs/bdd/example-mapping/
- OpenAI, guía Codex sobre preámbulos/actualizaciones: https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide
- Playwright, reporter y traza: https://playwright.dev/docs/test-reporters y https://playwright.dev/docs/trace-viewer-intro
- agent-browser, snapshots: https://agent-browser.dev/snapshots
- GitHub Actions, resúmenes estructurados: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands

Estas fuentes sustentan los principios de claridad, ejemplos, evidencia y progreso; **el formato concreto de JL es una propuesta de diseño**, no una capacidad nativa garantizada en todos los clientes.
