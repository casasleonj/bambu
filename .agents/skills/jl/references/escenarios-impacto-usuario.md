# Escenarios visibles y alcance funcional de extremo a extremo | JL

**Activación ESC-1/2/3:** para una funcionalidad nueva, modificación de regla/estado o bug con consecuencias en una tarea humana, varios roles/pantallas, datos persistentes o procesos posteriores. Complementa XMOD, no lo sustituye. Para un cambio estrictamente local y trivial, justificar alcance reducido con uno o dos ejemplos; no generar ceremonias innecesarias. **Aplica incluso cuando el issue solo menciona una pantalla** y el impacto real se descubre después. La investigación de empresas, comunidad y patrones en [evidence-reuse.md](evidence-reuse.md) alimenta ESC iterativamente: no se reemplaza con ejemplos ni se pospone hasta implementar.

## Problema que evita

Un mapa `fuente → consumidores` puede quedar técnicamente correcto y aun así omitir acciones futuras, entradas alternativas, botones, recuperación, cambios de estado y expectativas del trabajador/cliente. La investigación **no se completa** con una fórmula compartida o un listado de componentes: requiere **recorridos y consecuencias de negocio presentados a la persona que decide**.

## ESC-1 · Descubrimiento de escenarios antes del plan

1. **Fijar el evento de negocio y la promesa observable:** quién inicia, hecho que lo dispara, qué cambia en estado/saldo/derecho, quién lo puede consultar o usar, cuándo se aplica y cuándo termina/revierte. Distinguir *evento ocurrido*, *acción solicitada*, *dato mostrado* y *decisión de negocio todavía abierta*.
2. **Reconstruir el viaje temporal, no solo un diff:** ANTES (origen, precondiciones, creación) → DURANTE (entrada, selección, controles/botones, cálculo, confirmación) → DESPUÉS (persistencia, siguiente operación, historial, reportes, comunicación, cierre) → EXCEPCIONES (anulación, reembolso, error, reintento, concurrencia, offline). Seguir cada transición relevante, incluida la **próxima interacción** posterior al evento. Revisar qué ocurre si el usuario vuelve más tarde o entra desde otra pantalla.
3. **Cruzar perspectivas:** roles y permisos; pantallas y rutas de entrada (formulario, buscador, detalle, acciones, dashboard, histórico, cierre, informes, exportación, avisos); back-end (comandos, eventos, servicios, agregaciones, cachés, integraciones, jobs); tiempo y dispositivo. Usar búsquedas dirigidas de código, rutas, componentes, handlers, pruebas, contratos, historias/PR y documentación. No asumir que una pantalla deba incorporar el dato: **registrar candidato y decidir relevancia**.
4. **Event Storming ligero:** ordenar hechos y decisiones significativos: evento inicial → regla/política → comando/acción → eventos siguientes → vistas/consumidores. Identificar estados, transiciones, actores y puntos de fallo. No hace falta una sesión formal de taller si el código/evidencia basta. El objetivo es descubrir lo implícito, no dibujar diagramas ornamentales.
5. **Example Mapping orientado al negocio:** por regla identificada, escribir 1–3 casos concretos de `Dado / Cuando / Entonces` en lenguaje cotidiano (o **antes → persona actúa → después**), y registrar preguntas abiertas y escenarios fuera de alcance. Priorizar caminos principales, alternos y reversos; adaptar volumen a riesgo y número de decisiones.
6. **Clasificar certeza** de cada escenario: `CONFIRMADO` (usuario/decisión/contrato existente y vigente), `PROPUESTO` (recomendación, aún no autorizada), `PENDIENTE` (decisión de negocio material sin fuente), `NO_APLICA` (descartado con motivo), `NO_VERIFICADO` (falta de acceso/evidencia). No confundir *observado actualmente* con *comportamiento deseado*. Fuentes y estado de implementación por separado.
7. **Integrar precedentes SYN-1:** comprobar qué casos descubren soluciones públicas de empresas/comunidad, documentación oficial y patrones del sector, y qué implicaciones surgen al revisar el código propio (REUSE). Cada hallazgo relevante actualiza el mapa ESC y XMOD con su fuente, estado y prueba; ningún patrón externo se transforma en requisito confirmado sin autorización o contrato existente. Volver a buscar solo cuando un escenario nuevo abra una incertidumbre material.
8. **Cerrar la búsqueda con prueba de cobertura razonada:** por cada efecto de dominio revisar al menos entrada, uso posterior, vistas que lo muestran, cambios/reversión y escenarios adversariales pertinentes. Desde cada consumidor importante rastrear hacia la regla origen y desde cada evento volver a enumerar consumidores. Registrar lo no inspeccionado; evitar afirmar «todos» sin evidencia. Buscar contraejemplos y comprobar qué NO debe cambiar.

## ESC-2 · Presentación obligatoria al usuario antes de implementar

Entregar, tras SYN-2, un **MAPA DE ESCENARIOS DESCUBIERTOS** en lenguaje de trabajo, visible al responsable del producto, **antes del plan definitivo y de cualquier aprobación de diseño exigida**. No enterrarlo exclusivamente en un anexo técnico ni limitarlo a «revisaré consumidores». Para cada escenario prioritario:

`ID | persona y situación | dónde/qué acción o botón | qué debe ocurrir y qué no | módulos o efectos posteriores | estado/certidumbre | evidencia/decisión | prueba prevista`.

- Primero un resumen legible de **5–12 situaciones relevantes si existen**, agrupadas por recorrido (crear, consultar, usar, corregir, cerrar). Las restantes pueden quedar en anexo íntegro con IDs y trazabilidad; nunca ocultar casos críticos por un límite de longitud.
- **Mostrar hallazgos que el usuario no había mencionado**, incluidos los revelados por precedentes externos y por reutilización interna; indicar fuente, estado, razón de adopción/adaptación/descarte y si cambian requisitos, botones o próximos pasos. No solo repetir su descripción. Explicar decisiones recomendadas y consecuencias con números ilustrativos rotulados como hipótesis cuando proceda. Para flujos de alto riesgo, describir transición y saldo antes/después.
- **Invitar a detectar omisiones** con una pregunta abierta no bloqueante: «Estos son los escenarios que encontré y los que aún no puedo confirmar. ¿Hay algún caso cotidiano o comportamiento que deba añadir o que no deba ocurrir?». La respuesta no reemplaza investigar; **la falta de respuesta no es aprobación**.
- Si una regla material no puede derivarse con evidencia, hacer **una pregunta decisiva** con 2 opciones concretas, sus efectos y estado PENDIENTE, siguiendo [user-feedback.md](user-feedback.md). No hacer 15 preguntas triviales ni pedir que el usuario diseñe las implementaciones técnicas.
- Separar `alcance de este issue` y `efectos necesarios para coherencia` de `descubrimientos relacionados que requieren otro issue/fase`. Si aplazar un caso imprescindible rompe el recorrido, reflejarlo como **dependencia/bloqueo** y no vender el MVP como funcional completo.
- **GATE ESC-2:** cuando una decisión aplicable y vigente está documentada en contexto accesible (por ejemplo, aplicación automática del saldo), tomarla como requisito aportado; registrar fuente y alcance, verificar conflictos con las reglas existentes sin volver a preguntarla. La regla de otra empresa nunca reemplaza esa decisión. Si la fuente no es accesible, no suponerla. La propuesta no se califica como alcance investigado suficientemente hasta mostrar el mapa, las omisiones/ incertidumbres relevantes, el destino de cada caso y las aprobaciones que exija el proyecto. No crear aprobación adicional universal: la revisión es obligatoria; la aprobación formal solo si normas locales o decisiones pendientes la exigen.

## ESC-3 · Trazabilidad durante implementación y validación

- Mantener `escenario → regla → interfaz/servicio/estado → prueba → evidencia → estado`, con mismo ID estable en plan, maqueta, PR y QA. Ante cambios, actualizar mapa y notificar **solo** casos nuevos/materialmente cambiados; obtener nuevas aprobaciones si cambian contratos o maqueta autorizados.
- Diseñar maquetas de **todos los puntos de interacción y estados impactados razonablemente detectados**, no solo el primer formulario del issue; si un efecto es backend puro sin UI, justificar. Mostrar antes/después y avisar dónde se verá el estado, qué acción se espera y qué feedback/error/confirmación recibe la persona.
- Casos críticos: probar reglas de dominio y efectos entre módulos con unit/integración/contratos (XMOD-3); recorrer tareas humanas relevantes por UI con Playwright Test y/o navegador autónomo. Incluir **siguiente pedido/transacción**, saldos residuales, anulaciones/reversas, doble acción, reintento offline/online y visibilidad por roles cuando apliquen. Si no hay navegador, marcar esos escenarios NO EJECUTADOS, nunca aprobados.
- **GATE ESC-3:** `detectados → propuestos/confirmados → implementados → probados` con estado y evidencia por caso crítico. Un caso `PENDIENTE` que afecta corrección, permisos, dinero o integridad bloquea *esa entrega* si no hay diseño seguro autorizado; lo diferido no bloqueante queda explícito con dependencia/issue. No afirmar cobertura 100% o UX correcta con casos omitidos o sin ejecución.
- Comunicar avances por grupos: «Creación: 3/3 comprobados; pedido siguiente: 1/2, falla en anulación; informe: pendiente». Contadores solo con evidencia y denominador real. No emitir un mensaje por clic o escenario trivial.

## Ejemplo hipotético: saldo a favor, NO contrato aprobado ni diseño implementado

**Evento inicial:** una devolución podría generar un crédito de **$12.000** para un cliente, sujeto a la regla real de creación, autorizaciones, contabilidad y titularidad. Este ejemplo ilustra la investigación; **no define automáticamente las reglas de Agua Bambú**.

| ID | Situación de trabajo | Punto de entrada / consecuencia que se debe investigar | Estado sin verificar |
|---|---|---|---|
| SF-01 | Se registra una devolución que origina un saldo | Quién autoriza, persistencia, auditoría, recibo y reversión; ¿se reconoce como pasivo? | PENDIENTE |
| SF-02 | Administración consulta el historial | Mostrar cuándo se creó, por qué, cuánto queda y cada aplicación/anulación, con permisos y sin duplicar movimientos | PROPUESTO |
| SF-03 | Se busca o selecciona al cliente al crear pedido | ¿Dónde se avisa del saldo disponible? ¿Se muestra monto utilizable y procedencia sin filtrar datos sensibles? | PROPUESTO |
| SF-04 | Nuevo pedido de $9.000 con crédito $12.000 | **Cuando exista requisito vigente de aplicación automática, aplicarlo sin repreguntar**: $9.000 se descuentan y quedan $3.000, si el contrato y el instante de aplicación lo permiten. Investigar aparte cuándo se reserva o confirma; en otros proyectos no suponer modalidad automática | CONFIRMADO solo si hay fuente vigente; demás PENDIENTE |
| SF-05 | Nuevo pedido de $20.000 con crédito $12.000 | Si es aplicable, descontar $12.000 y cobrar $8.000 mediante métodos autorizados; impedir doble aplicación | PENDIENTE |
| SF-06 | Pedido anulado después de usar crédito | ¿Reintegra $12.000, lo deja reservado o requiere revisión? Según momento de confirmación y pagos reales; auditar compensación | PENDIENTE |
| SF-07 | Caja, dashboard y cierre del día | ¿Se ve saldo vigente, crédito usado, reembolsos y movimientos? Aplicar semántica: **usar crédito no equivale necesariamente a entrada de efectivo**; reconciliar valores sin duplicar ventas ni caja | PROPUESTO |
| SF-08 | Dos operadores crean pedidos concurrentes | Evitar gastar el mismo crédito dos veces con atomicidad/idempotencia y control del saldo disponible | PROPUESTO |
| SF-09 | Reintento, conexión lenta u offline | ¿Puede utilizarse el crédito sin conexión? ¿Cuándo se confirma? Tratar conflictos, reintentos y sincronización sin saldo negativo ni doble movimiento | PENDIENTE |
| SF-10 | Roles, recibo, exportaciones, informes y cliente inactivo | Verificar visibilidad, privacidad, filtros temporales e integraciones solo donde corresponde | NO_VERIFICADO |

**No convertir todos los renglones en botones o nuevas pantallas.** Es el mapa de posibilidades y riesgos a confirmar contra el producto, las decisiones del usuario y el código. Sin regla aprobada, **no inferir que el crédito se debe consumir automáticamente** aunque un ejemplo lo sugiera; plantear consecuencia y decisión material. Tampoco exigir que dashboard o producción exhiban el saldo de cada cliente por defecto: pueden necesitar agregación, informe, acceso contextual o justificación de no aplicabilidad.

**Mensaje de revisión ilustrativo:** «💡 Encontré 10 situaciones que podrían verse afectadas por el saldo a favor: crear crédito, verlo en historial, seleccionar cliente, usarlo en pedidos, anular, caja y consultas. Ocho requieren contraste del código y hay decisiones pendientes. En un pedido de $9.000 con $12.000 de crédito, ¿quieres que se aplique automáticamente cuando sea seguro o que el operador elija? Esto cambia el flujo y los controles. El resto de casos y sus pruebas están en el mapa; ¿hay algún caso cotidiano que falte?» **Ajustar conteos y preguntas a los hallazgos reales, no copiar cifras por defecto.**

## Fuentes de método (no certifican el comportamiento de ninguna aplicación)

- Cucumber, Example Mapping: https://cucumber.io/docs/bdd/example-mapping/
- Cucumber, explicación de historias/reglas/ejemplos/preguntas: https://cucumber.io/blog/bdd/example-mapping-introduction/
- EventStorming de Alberto Brandolini: https://www.eventstorming.com/ y https://www.eventstorming.com/book/
- Atlassian, Customer Journey Mapping y división frontstage/backstage: https://www.atlassian.com/team-playbook/plays/customer-journey-mapping
- Martin Fowler, Consumer-Driven Contracts: https://martinfowler.com/articles/consumerDrivenContracts.html

Estas referencias sustentan técnicas de descubrimiento y trazabilidad, **no** implican que exista una única implementación correcta del saldo a favor.
