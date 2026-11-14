# Dictamen compacto (expandir solo según riesgo)

**Mapa de escenarios ESC (si hay impacto humano multietapa):** IDs, tareas, botones/entradas, siguiente operación, historial, reversas, estado (`CONFIRMADO/PROPUESTO/PENDIENTE/NO_APLICA/NO_VERIFICADO`), evidencia y prueba real; presentar resumen cotidiano visible antes del plan y mantener trazabilidad hasta cierre. Ver [escenarios-impacto-usuario.md](../references/escenarios-impacto-usuario.md).

**Contrato breve de alcance (solo lo relevante):** `QUIERE / NO QUIERE / PRESERVAR / FUERA DE ALCANCE / ACEPTACIÓN`, fuente y certeza; pregunta concreta pendiente/contestada y decisión que cambia. No inventar límites ni repetir preguntas ya contestadas. No repetir en cada reporte los datos ya confirmados.

**Solicitud y estado:** ID/título, versión/SHA/fecha, fase (`INVESTIGAR/IMPLEMENTAR/VALIDAR/COMPLETO`), alcance (`UNO/LOTE`), decisiones vigentes, nivel de riesgo.

**Para quien usa el producto (breve):** problema, a quién afectaba, qué cambiará y qué seguirá igual. **Obligatorio al presentar solución y en el cierre:** un ejemplo cotidiano `antes → acción de la persona → después`, rotulado `hipotético` si no refleja un hecho comprobado. Añadir «¿y si…?» adversarial pertinente y estado de prueba; explicación técnica como respaldo, no sustituto. Ver [comunicacion-usuario.md](../references/comunicacion-usuario.md).

**Síntesis SYN-1/SYN-2 (si aplica):** patrones existentes en el proyecto y precedentes verificables de empresas/comunidad → hallazgos que añaden o cambian IDs ESC → alternativa adoptada/adaptada/descartada con razón; decisiones previas vigentes que no deben volver a preguntarse; lagunas que sí necesitan autorización. No atribuir éxito real a publicidad o ejemplos ilustrativos.

**Reutilización de código (si aplica):** REUSE-1/REUSE-2; qué función/objeto/componente ya existe, consumidores, contrato, decisión (usar/extender/componer/extraer/crear) y por qué no duplicar.

**Consistencia entre módulos (si XMOD aplica):** métrica/invariante y significado, fuente de verdad demostrada, consumidores directos/indirectos, clasificación igual/relacionada/distinta, período/filtros, diferencia y origen, N/N comprobados, tests API/DB/UI, estados PENDIENTE/PASÓ. No forzar igualdad entre métricas no equivalentes.

**Diagnóstico y evidencia:** confirmado / hipótesis / no verificado; causa y grafo entrada → servicio → datos → consumidores → efecto; fuentes con URLs o archivos+SHA, versiones, divergencias; DOC-1/DOC-2 cuando aplique.

**Alternativas y convergencia:** solución interna reutilizable, patrones externos transferibles, candidatas comparadas, principal contraejemplo, corrección de debilidad, iteraciones significativas y motivo de parada o bloqueo.

**Impactos activados:** backend/API/datos/offline/infra/seguridad/UI/UX. Para cada dimensión no aplicable registrar **motivo** en una línea. Si UI: distinguir design system, UI, UX y automatización por procedencia de datos.

**Criterios y pruebas:** resultado deseado + efecto prohibido/invariante → escenario positivo/negativo → test/evidencia; regresión, adversariales y plan de QA antes de producción. Registrar ejecución real, ambiente, SHA, defectos y re-test (o PENDIENTE).

**QA por agente en interfaz (si aplica):** herramienta (Playwright E2E/u otra), aviso de inicio real, **función/flujo en curso** (botones, filtros, formularios, links/URLs, navegación, lógica, UX), `j/N` recorridos y resultados, hitos relevantes, cierre `PASÓ/FALLÓ/PENDIENTE`, entorno/build/rol/dispositivo, incidencia y re-test. Nunca llamar test humano a una simulación por agente. Si no aplica o no hubo navegador, consignar motivo, sin inventar mensajes de ejecución.

**Decisión:** CONVERGENCIA DE DISEÑO / CONDICIONADA / BLOQUEADA / VALIDADA; aprobación pendiente, permiso de merge/deploy, riesgos conocidos. Nunca dar por aprobado solo con CI en verde.

**Si son varios issues:** dictamen resumido por issue con cobertura `N/N` y tabla `issue | dependencia/conflicto | contrato o entidad compartida | fase sugerida | bloqueo`. Investigar todos, no mezclar aprobaciones ni cambios inadvertidamente.

**Presupuesto de salida:** por defecto 1 resumen y una tabla focalizada. Añadir anexos solo para riesgos o evidencias que cambian decisiones. No sacrificar información esencial; evitar repetir fuentes o procesos ya citados.

**Comunicación de maquetas y pruebas de agente:** distinguir `maqueta en preparación / visible / aprobación pendiente / aprobada`, `evals definidas / pruebas estáticas ejecutadas / ejecuciones reales del agente`, y cambios de flujo relevantes; no hacer afirmaciones sobre capturas inexistentes, usuarios humanos simulados o herramientas no usadas.

**Si `COMPLETO`:** comunicar inicio y fin verificados de cada etapa (o pausa/reapertura); avance por etapa, permisos/gates y próxima acción. No duplicar avisos ya emitidos en el informe. Si `LOTE+COMPLETO`: inventario `N/N`, matriz de estado individual (investigado/implementado/validado/bloqueado), dependencias y regresión transversal; no declarar terminado por mayoría.
