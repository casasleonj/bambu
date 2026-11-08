# Dictamen compacto (expandir solo según riesgo)

**Contrato breve de alcance (solo lo relevante):** `QUIERE / NO QUIERE / PRESERVAR / FUERA DE ALCANCE / ACEPTACIÓN`, fuente y certeza; pregunta concreta pendiente/contestada y decisión que cambia. No inventar límites ni repetir preguntas ya contestadas. No repetir en cada reporte los datos ya confirmados.

**Solicitud y estado:** ID/título, versión/SHA/fecha, fase (`INVESTIGAR/IMPLEMENTAR/VALIDAR/COMPLETO`), alcance (`UNO/LOTE`), decisiones vigentes, nivel de riesgo.

**Para quien usa el producto (breve):** qué problema había, a quién afectaba, qué cambiará, qué seguirá igual, ejemplo antes → acción → después, 2–5 «¿y si…?» relevantes, qué falta por comprobar.

**Reutilización de código (si aplica):** REUSE-1/REUSE-2; qué función/objeto/componente ya existe, consumidores, contrato, decisión (usar/extender/componer/extraer/crear) y por qué no duplicar.

**Diagnóstico y evidencia:** confirmado / hipótesis / no verificado; causa y grafo entrada → servicio → datos → consumidores → efecto; fuentes con URLs o archivos+SHA, versiones, divergencias; DOC-1/DOC-2 cuando aplique.

**Alternativas y convergencia:** solución interna reutilizable, patrones externos transferibles, candidatas comparadas, principal contraejemplo, corrección de debilidad, iteraciones significativas y motivo de parada o bloqueo.

**Impactos activados:** backend/API/datos/offline/infra/seguridad/UI/UX. Para cada dimensión no aplicable registrar **motivo** en una línea. Si UI: distinguir design system, UI, UX y automatización por procedencia de datos.

**Criterios y pruebas:** resultado deseado + efecto prohibido/invariante → escenario positivo/negativo → test/evidencia; regresión, adversariales y plan de QA antes de producción. Registrar ejecución real, ambiente, SHA, defectos y re-test (o PENDIENTE).

**Decisión:** CONVERGENCIA DE DISEÑO / CONDICIONADA / BLOQUEADA / VALIDADA; aprobación pendiente, permiso de merge/deploy, riesgos conocidos. Nunca dar por aprobado solo con CI en verde.

**Si son varios issues:** dictamen resumido por issue con cobertura `N/N` y tabla `issue | dependencia/conflicto | contrato o entidad compartida | fase sugerida | bloqueo`. Investigar todos, no mezclar aprobaciones ni cambios inadvertidamente.

**Presupuesto de salida:** por defecto 1 resumen y una tabla focalizada. Añadir anexos solo para riesgos o evidencias que cambian decisiones. No sacrificar información esencial; evitar repetir fuentes o procesos ya citados.

**Si `COMPLETO`:** comunicar inicio y fin verificados de cada etapa (o pausa/reapertura); avance por etapa, permisos/gates y próxima acción. No duplicar avisos ya emitidos en el informe. Si `LOTE+COMPLETO`: inventario `N/N`, matriz de estado individual (investigado/implementado/validado/bloqueado), dependencias y regresión transversal; no declarar terminado por mayoría.
