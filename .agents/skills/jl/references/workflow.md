# Orquestación de JL: COMPLETO, LOTE y reanudación

**Ámbito:** solo se carga al solicitar flujo de extremo a extremo (`COMPLETO`), varios issues (`LOTE`) o reanudar una etapa. Este archivo **no añade un proceso paralelo**: orquesta la investigación, la implementación y la verificación existentes. El skill sigue siendo agnóstico a proyectos, tecnologías, plataformas y CI.

## Intento del usuario → selección

| Petición | Fase | Alcance | Resultado esperado |
|---|---|---|---|
| «Investiga/analiza el issue X» | INVESTIGAR | UNO | Diagnóstico y propuesta; sin escribir código |
| «Implementa el plan aprobado para X» | IMPLEMENTAR | UNO | Código y pruebas con permisos y requisitos vigentes |
| «Valida el PR / cambio X» | VALIDAR | UNO | Evidencias de cumplimiento, defectos o bloqueos |
| «JL, resuelve el issue X de principio a fin» | COMPLETO | UNO | Investigar, aprobar plan, implementar, validar y preparar liberación |
| «Investiga los issues A, B, C» | INVESTIGAR | LOTE | Informe individual N/N y dependencias |
| «JL, resuelve A, B y C: investiga todo, implementa todo, valida todo» | COMPLETO | LOTE | Investigación global N/N; implementación ordenada; QA por unidad y transversal |
| «Instálame/actualízame JL» | INSTALAR | Administración | Usar proceso separado de instalación |

**Regla de interpretación:** `LOTE` no reemplaza fase y `COMPLETO` no reemplaza alcance. No inventar autorización a partir de frases como «hazlo todo»; sí interpretar la orden como deseo de orquestar todas las etapas y **seguir automáticamente entre las que estén desbloqueadas**. Si el usuario solo dijo «soluciona» y no dio plan, escoger `COMPLETO` para no quedarse en diagnóstico. Si en el proyecto la acción requiere aprobación explícita, solicitarla en el gate concreto, no al principio para cada paso trivial.

## Microconsultas y reanudación

Antes de una **decisión no verificable técnicamente** (resultado esperado, efecto inaceptable, regla de negocio, criterio UX o aprobación), aplicar [user-feedback.md](user-feedback.md): reconstruir `QUIERE / NO QUIERE / PRESERVAR / FUERA DE ALCANCE / ACEPTACIÓN` desde evidencia, preguntar **solo por el vacío material**, registrar fuente y continuar automáticamente lo autorizado. No intentar enumerar todas las prohibiciones posibles ni insistir si la respuesta es «no sé». Una pausa por feedback **no** es fase terminada. En lote preguntar una sola vez por regla compartida, asociar los IDs afectados y avanzar issues independientes. Una respuesta que cambia un requisito material reabre únicamente las fases/validaciones afectadas.

## Comunicación de transiciones (sin mensajes redundantes)

Usar el contrato de [comunicacion-usuario.md](comunicacion-usuario.md): cada aviso debe explicar el **hito real, su repercusión para el usuario y el siguiente paso**. Al presentar el plan y cerrar el trabajo aportar **un ejemplo cotidiano antes → acción → después**, no solo el diagnóstico técnico. Los mensajes siguientes son la estructura mínima; adaptarlos a hallazgos reales, maquetas, CI, pruebas del agente y QA sin inflar la conversación.

La fase se **anuncia cuando comienza a ejecutarse**, no al prometerla. Su cierre se anuncia **después** de obtener evidencia o de registrar un bloqueo. Ejemplos mínimos, ajustables al contexto:

| Evento | Mensaje visible corto |
|---|---|
| Inicio INVESTIGAR | `🔎 JL · Investigando #X: causa, alcance y precedentes.` |
| Fin INVESTIGAR | `✅ JL · Investigación terminada #X: diagnóstico sustentado; plan listo [o gate pendiente].` |
| Inicio IMPLEMENTAR | `🛠️ JL · Implementando #X: cambio autorizado.` |
| Fin IMPLEMENTAR | `✅ JL · Implementación terminada #X: cambio aplicado y pruebas locales identificadas; QA aún pendiente.` |
| Inicio VALIDAR | `🧪 JL · Validando #X: regresiones y QA aplicable.` |
| Inicio QA E2E/navegador | `🧭 JL · QA DE USUARIO INICIADO #X: Playwright E2E en preview; rol/dispositivo y N recorridos.` **Solo al ejecutar realmente el runner/navegador**, no al planearlo. |
| Progreso subfase QA | `🔄 JL · QA DE USUARIO EN CURSO #X: probando filtros y enlaces; 2/4 flujos ejecutados; un botón falló.` Solo hitos significativos, no cada clic. |
| Fin subfase QA | `✅ JL · QA DE USUARIO FINALIZADO #X: N/N ejecutados, resultados y evidencia.` Si quedan fallos `⚠️ ... EJECUTADO CON FALLOS`; sin navegador `⏸️ ... PENDIENTE`. |
| Fin VALIDAR | `✅ JL · Validación terminada #X: pruebas reales [evidencia] y resultado [APTO/BLOQUEADO según gates].` |
| Gate sin permiso | `⏸️ JL · Esperando aprobación [fase]: [decisión exacta].` |
| Fallo nuevo | `🔁 JL · Reabriendo [fase] #X: [falla], corregir y volver a comprobar.` |

**Reglas:** Si hubo maquetas, distinguir `EN PREPARACIÓN / DISPONIBLE / PENDIENTE DE APROBACIÓN / APROBADA`, no atribuir aprobación al usuario sin evidencia. Si se validan agentes o skills, distinguir evaluaciones definidas y ejecutadas; al usar subagentes, informar misión y hallazgo solo cuando aporte algo, sin narrar cada llamada. QA en navegador es una subfase de VALIDAR: inicio real, avance relevante y cierre verificable; ver [verification-release.md](verification-release.md). No confundir recorrido realizado por un agente con test de una persona real. No informar «terminada» si solo existe una propuesta o si fallaron controles requeridos. Si una investigación es parcial, comunicar `INVESTIGACIÓN PARCIAL/PAUSADA`, no `TERMINADA`. Con `LOTE`, usar `Lote N/N · investigados i/N, implementados j/N, validados k/N, bloqueados b`; hacer un aviso de inicio y uno de fin **por barrido**, y avisos puntuales solo ante bloqueos/errores relevantes. Una fase interna reabierta no obliga a repetir informes anteriores. La aprobación y la liberación no se infieren de los mensajes; requieren su evidencia propia.

## Máquina de estados mínima por unidad (idempotente)

`PENDIENTE → INVESTIGADO → PLAN_APROBADO → IMPLEMENTADO → QA_PREPROD_VALIDADO → LISTO_PARA_LIBERAR → LIBERADO → VERIFICADO`.

- `INVESTIGADO`: problema, estado real, fuente, causa o hipótesis, alternativa y casos adversariales documentados. **No** significa corregido.
- `PLAN_APROBADO`: evidencia de aprobación según reglas locales; si no aplica autorización separada, registrar esa condición. Para UI cumplir maqueta/aprobación cuando corresponda.
- `IMPLEMENTADO`: cambios y tests locales identificados; **no** significa CI ni UX aprobados.
- `QA_PREPROD_VALIDADO`: CI y E2E aplicables, regresiones y recorrido realista en interfaz si afecta interacción o experiencia; evidencia por SHA, ambiente y caso. Sin herramientas → `QA_PENDIENTE`, no inventar resultado.
- `LISTO_PARA_LIBERAR`: todas las condiciones y aprobaciones correspondientes presentes; no se alcanza por CI verde solamente.
- `LIBERADO` / `VERIFICADO`: únicamente tras merge/despliegue autorizados y comprobación real, cuando formen parte del encargo.
- Estados de bloqueo: `ESPERA_RESPUESTA`, `ESPERA_APROBACIÓN`, `BLOQUEADO_HERRAMIENTAS`, `BLOQUEADO_RIESGO`, `QA_PENDIENTE`, `FALLO_EN_CORRECCIÓN`. Mantener el estado anterior + bloqueo; al reanudar, reevaluar el código/versiones cambiados.

No pasar de estado por narración: exigir evidencia (identificador de PR/commit, log de test, captura/trace, aprobación, etc.). Un modo puede finalizar **con trabajo pendiente honestamente reportado** si la acción no está autorizada o las herramientas faltan.

## UNO + COMPLETO

1. **Descubrir:** issue/requisitos/instrucciones, código real, permisos, stack real, pruebas, release gates y dependencias. Evitar cargar todo el repositorio.
2. **INVESTIGAR:** mapear ESC-1 y presentar ESC-2 al usuario antes de plan/maqueta conforme [escenarios-impacto-usuario.md](escenarios-impacto-usuario.md); causa, impactos, fuentes verificables, precedentes, REUSE-1 y DOC-1 cuando apliquen, alternativas, adversariales y convergencia de diseño. Elaborar plan y caso de aceptación.
3. **Gate de plan/UI:** cumplir **solo** aprobaciones efectivamente exigidas por usuario/entorno/proyecto. No interpretar «resuélvelo» como aprobación de un plan nuevo que deba revisarse.
4. **IMPLEMENTAR:** REUSE-2 y DOC-2 aplicables, pequeño cambio enfocado y tests proporcionales; seguir convenciones locales (fases, ramas, revisiones, PR, permisos). Reabrir investigación si aparece evidencia contraria importante.
5. **VALIDAR:** cerrar ESC-3 por escenario relevante, incluida operación posterior y reversa; unitarias, integración, seguridad, CI/shards relevantes y QA de navegador en preview/staging según impacto. **Si afecta regla compartida, cerrar XMOD-3 por consumidor y no solo el issue local; reportar avance n/N y discrepancias por hitos sin spam** ([cross-module-consistency.md](cross-module-consistency.md)). Comprobar problema original y casos adversariales; capturas, enlaces, tipografía, estados y persistencia si aplica. Corregir y repetir donde falle.
6. **Liberación:** no fusionar ni desplegar cuando los controles necesarios siguen pendientes; asegurar QA **antes de acciones que puedan desplegar producción**. Post-merge/post-release solo como segunda barrera, nunca como sustituto de QA previo.

## LOTE + COMPLETO: tres barridos globales, con gates por unidad

**Barrido A | Investigar TODO el lote:** fijar inventario `IDs N/N` y estado, deduplicados; buscar dependencias, subsistemas y contratos comunes; investigar **cada** unidad, evidencia y plan, más riesgos **entre** unidades. Reusar hallazgos sin suprimir el dictamen individual. Si una tarea no está accesible, anotar `SIN DATOS/BLOQUEADA`, no llamarla investigada.

**Barrido B | Implementar TODO lo autorizado:** establecer orden topológico del grafo de dependencias, prioridad de riesgo y restricciones del repositorio. Antes de cada unidad comprobar que sigue vigente y aprobada. No meter N issues en el mismo PR por defecto; una fase/rama/PR según las reglas locales. Aplicar funciones reutilizables y contratos compartidos con un dueño claro, evitando implementaciones divergentes. Integrar solo cuando el gate previo lo permita; si merge despliega producción, **QA preproducción de esa unidad antes del merge**, incluso si la validación global del lote todavía no terminó. No ocultar bloqueos individuales; tareas independientes pueden continuar si el proyecto lo permite.

**Barrido C | Validar TODO:** pruebas por issue `N/N`, más **conciliación XMOD-3 de métricas/reglas compartidas en cada consumidor** y regresión transversal sobre partes compartidas, permisos, roles, integración de flujos y QA visual/UX pertinente. Comparar el comportamiento de las versiones concretas. Cuando se detecte un fallo: volver a investigar/corregir **esa unidad y sus dependientes**, repetir checks impactados y luego el gate transversal. No marcar `N/N` validado hasta que **cada** unidad aplicable tenga evidencia.

Los barridos son una **vista de gestión**: no suspenden gates obligatorios por PR ni implican que todo el lote se implementa sin aprobaciones. Si la política del proyecto requiere integrar cada fase antes de empezar la siguiente, respetarla: preparar mapa de todo el lote, luego ciclo implementación → QA → integración por fase, finalizando con validación transversal después de la última.

## Reanudación sin duplicar investigación ni gastar tokens

Guardar, en el artefacto de trabajo permitido por el proyecto, una ficha mínima por unidad:

`id | estado | bloqueo | base SHA/versión | causa y fuente | límites negativos/invariantes y fuente | pregunta/feedback pendiente y respuesta confirmada | solución/contrato reutilizado | aprobación | archivos/PR | tests/QA y evidencia | dependencias | siguiente acción`.

Reanudar desde el último estado **realmente demostrado**; si cambió `main` o el contrato compartido, comprobar impacto y revalidar lo afectado antes de reutilizar evidencia. No recargar guías ajenas al issue ni repetir búsquedas ya sustentadas. Reportar `Investigados i/N · Implementados j/N · Validados k/N · Bloqueados b` y las razones concretas. Evitar prometer trabajo futuro fuera de la sesión sin un mecanismo de ejecución persistente disponible.

## Autocrítica que evita un falso COMPLETO

1. ¿Se quedó en propuesta aunque la orden era resolver? Si estaba autorizado y había herramientas, continuar.
2. ¿Se modificó código sin revisar el gate del plan o la maqueta exigida? Bloquear y regularizar, no afirmar éxito.
3. ¿Se calificó todo el lote por el progreso de un solo issue? Corregir matriz N/N.
4. ¿Se hizo QA global pero se omitió QA preproducción antes de un merge con despliegue automático? Gate incumplido.
5. ¿Algún límite NO QUIERE/PRESERVAR carece de prueba o contradice la propuesta? Reabrir solo esa decisión. ¿Una regresión transversal invalida el «validado» de otra tarea? Reabrir solo dependientes o afectados, con justificación.
6. ¿Se fusionaron tareas inconexas en una rama o se duplicaron funciones compartidas? Rediseñar entregas, no duplicar.
7. ¿No hay CI/navegador/acceso o aprobación? Estado pendiente/bloqueado, sin afirmar ejecución.
8. ¿Se implementó un cambio ya resuelto en otra rama del mismo lote? Comprobar SHA, estado e idempotencia antes de actuar.
