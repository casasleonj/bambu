# Inventario semántico contrastable · PR #718

**Estado: PREANÁLISIS Y EXTRACCIÓN COMPLETA, NO CERTIFICACIÓN.**

Este registro cruza la fuente original con el catálogo previo `contratos-operativos.md` y los destinos modulares propuestos. `obligaciones_atomicas.csv` contiene **556 entradas**: 354 preanálisis conceptuales AB y 202 posiciones candidatas todavía sin descomposición. Se preservan las 530 posiciones candidatas originales (algunas se solapan porque una misma línea puede originar varias cláusulas). Las 798 posiciones del inventario fuente siguen disponibles. No confundir estas cantidades con obligaciones distintas verificadas.

## Método reproducible

1. Recuperar las seis partes de `fuente-original/`, con hash del blob original controlado por `check_modularizacion.py`.
2. Para cada una de las 354 cláusulas `AB-xxxx`, registrar **texto fuente literal**, significado preliminar, condición y excepción expresas del catálogo de preanálisis.
3. Para cada una de las 202 líneas candidatas sin cláusula AB, conservar **texto fuente literal** y proponer módulo de consulta por rango de origen. No inventar interpretación: se marca `EXTRACCION_LITERAL_PENDIENTE_DESCOMPOSICION`.
4. Revisar cada registro en su párrafo y sección completos. Distinguir decisión PO, regla de agente, dato técnico histórico, incidente resuelto, propuesta y obsoleto. Verificar Contexto Maestro y Planes Maestros autorizados antes de decidir vigencia. Comprobar código `main` para hechos técnicos.
5. Para cláusulas compuestas, crear nuevas filas atómicas con rangos repetidos, sin borrar la cláusula fuente. Reescribir `destino_activo` solo después de confirmar **que el agente realmente recupera el contrato vigente**; la ruta actual en CSV es *candidata*, no prueba de activación.
6. Tras cotejo y evidencia, un revisor autorizado puede clasificar `VIGENTE`, `HISTORICO_NO_NORMATIVO` o `CAMBIO_APROBADO`, y marcar `VERIFICADA`. Los valores actuales `POR_DETERMINAR` / `PENDIENTE` son deliberados.

## Riesgos materiales encontrados

- **#704**: R3 de implementación dentro de ciclos previos a programar; la solución propuesta separa R1+R2 ×3 y R3 posterior a autorización. Requiere confirmar la decisión y las condiciones de alcance.
- **UI/UX**: maqueta escritorio y móvil, estados de carga/error/confirmación y aprobación PO explícita; una autorización de backend no la sustituye.
- **Dinero y offline**: no asumir que un incidente histórico equivale al contrato actual. Revisar idempotencia por borrador, FIFO, exigibilidad, pagos mixtos, fecha de negocio, exactitud monetaria, reintentos y consumidores XMOD.
- **Flujo de entrega**: conflicto entre prohibir todo stack y admitir stacks explícitos; las excepciones deben quedar justificadas.
- **Migraciones**: instrucciones de aplicar en producción antes de merge deben evaluarse contra compatibilidad expand-contract, riesgos de datos y autorizaciones reales; nunca ejecutar por obediencia ciega a texto antiguo.
- **Fuentes**: catálogo AB es un preanálisis anterior, **no firma de equivalencia**. La presencia de una ruta de destino no demuestra que se haya leído ni que su contenido sea vigente.

## Evidencia y límites

El nuevo archivo permite auditar sin perder una línea candidata y hace visibles las excepciones ya extraídas. **No pasa todavía el gate semántico** porque la revisión de las 556 entradas, la resolución de contradicciones y la certificación de comportamiento requieren evidencia adicional. El estado debe permanecer bloqueado hasta entonces. No modificar `evidencia_no_ejecutada.json` para simular aprobación.
