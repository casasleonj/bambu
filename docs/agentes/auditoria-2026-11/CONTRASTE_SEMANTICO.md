# Inventario semántico contrastable · PR #718

**Estado: PREANÁLISIS Y EXTRACCIÓN COMPLETA, NO CERTIFICACIÓN.**

Este registro cruza la fuente original con el catálogo previo `contratos-operativos.md` y los destinos modulares propuestos. `obligaciones_atomicas.csv` contiene **556 entradas**: 354 preanálisis conceptuales AB y 202 posiciones adicionales con clasificación, significado, condiciones y excepciones de preanálisis (no firmadas). Se preservan las 530 posiciones candidatas originales (algunas se solapan porque una misma línea puede originar varias cláusulas). Las 798 posiciones del inventario fuente siguen disponibles. No confundir estas cantidades con obligaciones distintas verificadas.

## Método reproducible

1. Recuperar las seis partes de `fuente-original/`, con hash del blob original controlado por `check_modularizacion.py`.
2. Para cada una de las 354 cláusulas `AB-xxxx`, registrar **texto fuente literal**, significado preliminar, condición y excepción expresas del catálogo de preanálisis.
3. Para las 202 líneas candidatas sin cláusula AB, registrar origen y una clasificación preliminar separada en `clasificacion_candidatas_202.csv`; no tratarla como certificación ni omitir subdividir líneas compuestas.
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


## Cuarta revisión: contraste dirigido con `main` actualizado (2026-11-09)

**SHA de `main`:** `ef0bc0dd0736e3acfd9d9d0bf64ffc5ff62fb44f`. Fuente: lectura por GitHub a SHA, **no prueba E2E ni certificado de producto**.

| Cláusula / fuente | Hallazgo verificable | Criterio y excepción | Resultado |
|---|---|---|---|
| AB-0049 / AGENTS L223 | `src/lib/geo/pedido-coords.ts#L52` usa `Pedido → Negocio → Cliente`; el archivo antiguo solo citaba Negocio → Cliente | No revertir destino propio por copiar una nota vieja; rastrear su Plan Maestro | Estado técnico nuevo identificado |
| AB-0144 / AGENTS L621 | `src/app/api/cierre-dia/route.ts` solo tiene GET; #691 eliminó POST alternativo | No abrir bug por endpoint eliminado; auditar otros escritores si hay evidencia | Hallazgo concreto superado |
| AB-0104 / AGENTS L525 | `src/lib/cierre-totales.ts#L17-L25` aún descuenta todos los gastos y comisiones como efectivo | Puede divergir de métodos de desembolso y del ADR vigente; no inventar decisión ni modificar caja sin pruebas | SUPUESTO TÉCNICO POR VALIDAR |
| AB-0010 / L114 | `src/lib/cierre-totales.ts#L35-L44` distingue valor comercial, entregado y notas crédito del período | El importe histórico no reconstruye saldo pasado; considerar snapshots y exigibilidad | Contrato relevante a XMOD |
| AB-0027 / L156 | `src/lib/fiados-cobro-server.ts#L87-L93` rechaza sobrepago **puntual** de pedido del día | No confundir con sobrante permitido en cobro general de fiados | Dos flujos distintos |
| AB-0132 / L598 | `src/app/api/pedidos/pagar-fiado/route.ts#L171-L185` acredita sobrante al cliente real y crea `IngresoSaldoFavor` | No acreditarlo a consumidor final; comprobar reintentos, monto por método y downstream | Implementación observada, tests no ejecutados |
| AB-0009 / L50 | `prisma/schema.prisma` usa `Decimal(10,2)` para saldoFavor; `Pago.offlineId` es índice no único | `Pedido.offlineId` sí es único. No imponer constraint igual a todos los modelos | Persistencia diferencial |

**Decisiones posteriores relevantes:** `docs/adr/ADR-MONETARIO-002.md`, `ADR-CIERRE-004.md`, `ADR-REDUCCION-COMERCIAL-001.md` de `main` recogen autorización de saldo a favor en sobrepago de corrección/reducción, nota de crédito para reducción y pendiente #713 para corrección de precio a la baja. Algunas secciones históricas de esos ADR contienen la redacción antigua de rechazo; la decisión posterior documentada tiene prioridad, pero no se modifica el ADR silenciosamente.

**Límite explícito:** las filas no inspeccionadas en código conservan el estado `NO_VERIFICADO_MAIN` cuando esa comprobación sea pertinente. Las 556 entradas no están firmadas por revisor, y la evaluación de agentes A/B sigue pendiente.
