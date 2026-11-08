# Contraste limitado de cláusulas con código `main` · PR #718

**Fuente del estado técnico verificado:** `main` commit [`03523c6778a8a252e8decff4ea1891c2e99815ec`](https://github.com/casasleonj/bambu/commit/03523c6778a8a252e8decff4ea1891c2e99815ec) consultado el 8 de noviembre de 2026. La evidencia consiste en lectura de archivos y rutas GitHub, **no pruebas de integración ejecutadas**. El Contexto Maestro privado/Planes Maestros podrían exigir condiciones adicionales: su autoridad de producto no se sustituye por el código.

Esta tabla documenta hallazgos concretos; no transforma el resto de 810 registros en verificados. Una conclusión `COINCIDE` se limita a la regla citada y al segmento inspeccionado. `SUPERADO` se refiere a una **afirmación técnica histórica**, no a la revocación de una decisión del PO.

| Origen | Resultado | Evidencia main | Significado / condiciones / límite |
|---|---|---|---|
| L178 | `SUPERADO_EN_MAIN` | [route.ts L21](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/app/api/clientes/[id]/contactos/route.ts#L21) | El supuesto pendiente de CRUD de contactos queda refutado por POST protegido en main. PATCH y DELETE existen en la ruta con contactoId. |
| L371 | `COINCIDE_EN_MAIN` | [route.ts L69](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/app/api/clientes/[id]/contactos/route.ts#L69) | POST captura violación de unicidad Prisma P2002 y responde 409; rol ADMIN/ASISTENTE. |
| L372 | `COINCIDE_EN_MAIN` | [route.ts L22](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/app/api/clientes/[id]/contactos/[contactoId]/route.ts#L22) | PATCH existe y captura P2002 como colisión, protegido por rol. |
| L373 | `COINCIDE_PARCIAL_EN_MAIN` | [route.ts L103](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/app/api/clientes/[id]/contactos/[contactoId]/route.ts#L103) | DELETE existe; revisión completa de filtración 404 por ajeno requiere inspección de todas sus ramas. |
| L621 | `SUPERADO_EN_MAIN` | [route.ts L7](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/app/api/cierre-dia/route.ts#L7) | El POST alterno de cierre ya no existe: la ruta es solo GET, corrección #691. La nota del original es obsoleta. |
| L617 | `COINCIDE_EN_MAIN` | [base-caja-dia.ts L8](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/lib/base-caja-dia.ts#L8) | La base de caja se lee por clave BASE_DIA_<fecha>, sin default silencioso. |
| L619 | `COINCIDE_EN_MAIN` | [route.ts L232](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/app/api/cierre/route.ts#L232) | POST /api/cierre llama exigirBaseVigente dentro de la transacción del cierre. |
| L523 | `COINCIDE_EN_MAIN` | [cierre-totales.ts L20](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/lib/cierre-totales.ts#L20) | Efectivo esperado separado de neto y expresado en centavos. Mantiene supuestos de gastos/comisiones que requieren cotejo por origen. |
| L525 | `CONTRASTE_DEPENDIENTE` | [cierre-totales.ts L17](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/lib/cierre-totales.ts#L17) | La función aún comenta supuesto de gastos y comisiones en efectivo; la nómina por método sí diferencia egresos. No convertir comentario histórico en regla financiera universal. |
| L531 | `COINCIDE_EN_MAIN` | [route.ts L68](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/app/api/nomina/[id]/route.ts#L68) | Pago de nómina distingue efectivo dentro de caja de digital/fuera de caja; la anulación revierte egreso si existió. |
| L532 | `COINCIDE_EN_MAIN` | [route.ts L78](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/app/api/gastos/route.ts#L78) | POST gastos rechaza categoría NOMINA para evitar doble contabilización. |
| L598 | `COINCIDE_EN_MAIN` | [route.ts L184](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/app/api/pedidos/pagar-fiado/route.ts#L184) | Registra ingresoSaldoFavor append-only dentro del mismo callback transaccional para excedente válido. |
| L599 | `COINCIDE_PARCIAL_EN_MAIN` | [route.ts L78](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/app/api/pedidos/pagar-fiado/route.ts#L78) | El flujo coteja offlineId antes del registro; verificación completa de constraints requiere revisar Prisma schema y migración. |
| L156 | `COINCIDE_EN_MAIN` | [fiados-cobro-server.ts L80](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/lib/fiados-cobro-server.ts#L80) | Cobro puntual distingue cliente real, entrega del día Bogotá, promesa fiado, deuda anterior FIFO y tope de importe. |
| L223 | `HISTORICO_SUPERADO_POR_CODIGO` | [pedido-coords.ts L52](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/lib/geo/pedido-coords.ts#L52) | Orden ACTUAL: coordenadas propias del pedido > negocio > cliente. El AGENTS original documentaba solo negocio > cliente. Cambio técnico comprobado; rastrear decisión/Plan Maestro de destino propio antes de declararlo normativo. |
| L224 | `COINCIDE_EN_MAIN` | [pedido-coords.ts L39](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/lib/geo/pedido-coords.ts#L39) | Se descartan null/undefined antes de Number, evitando 0/0 falso. |
| L225 | `COINCIDE_PARCIAL_EN_MAIN` | [pedido-coords.ts L52](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/lib/geo/pedido-coords.ts#L52) | Resolver compartido pickCoords presente; los cinco consumidores exactos requieren comprobación por referencia/uso. |
| L162 | `COINCIDE_EN_MAIN` | [sync.ts L135](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/lib/db/sync.ts#L135) | El cliente mantiene syncQueue histórica y requestQueue y drena ambas. |
| L147 | `COINCIDE_PARCIAL_EN_MAIN` | [fetch-resilient.ts L117](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/lib/fetch-resilient.ts#L117) | fetchResilient existe con cola offline; distinguir fallos de red frente a HTTP requiere revisar ramas 160–220. |
| L434 | `COINCIDE_EN_MAIN` | [dates.ts L86](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/lib/dates.ts#L86) | buildDateRangeFilter permite rangos parciales con límites de día Bogotá. |
| L545 | `COINCIDE_PARCIAL_EN_MAIN` | [route.ts L70](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/app/api/nomina/dia/pagar/route.ts#L70) | offlineId dedup de pago comisión en servidor; conciliación total con cierre/nómina exige revisar consumidores. |
| L504 | `PENDIENTE_EVIDENCIA_MAIN` | [route.ts L67](https://github.com/casasleonj/bambu/blob/03523c6778a8a252e8decff4ea1891c2e99815ec/src/app/api/pedidos/pagar-fiado/route.ts#L67) | Este archivo es de fiados y no verifica venta anónima. Se requiere la ruta de venta correspondiente; no inferir. |

## Ejemplos adversariales de reconciliación

**1. CRUD Contactos.** La fuente antigua L178 lo presenta pendiente; la sección posterior L369–382 habla de su resolución; `main` tiene POST, PATCH y DELETE protegidos. **Resultado:** no generar un issue nuevo por una afirmación anticuada; validar cada excepción, como 409 en duplicado y privacidad en contacto ajeno.

**2. Base de caja.** La fuente L621 alertaba sobre `POST /api/cierre-dia` que esquivaba la validación. En `main`, esa ruta registra explícitamente que #691 eliminó POST; `POST /api/cierre` invoca `exigirBaseVigente` bajo transacción. **Resultado:** el riesgo *concreto de ese endpoint* está resuelto en el código observado; no equivale a probar todas las posibles rutas de cierre o permisos.

**3. Geografía.** El AGENTS viejo decía negocio antes que cliente. `pickCoords` actual antepone coordenadas de destino propio del `Pedido`, luego negocio y luego cliente, sin convertir null en cero. **Resultado:** el archivo histórico estaba incompleto tras evolución técnica. Falta recuperar la decisión posterior que autorizó el destino propio; no degradar la nueva prioridad por copiar el pasado.

**4. Caja, nómina y saldo.** La separación entre efectivo esperado y neto existe; pagar nómina distingue caja/digital; los gastos NOMINA directos se rechazan; registrar cobro de fiado escribe ingreso de saldo a favor con traza. **Límite:** solo inspeccionar código no prueba cierre, dashboard, caché, cortes, dedup y producción en ejecución. Aplicar JL XMOD-3 y tests pertinentes.

**5. Fiados puntuales.** El helper de cobranza verifica fecha Bogotá, cliente canónico, venta fiada intencional, deuda anterior y sobrepago. **Límite:** las excepciones deben probarse con fixture representativo; esta revisión no ejecutó flujos.

## Pendientes reales

- Contrastar las restantes cláusulas descompuestas frente a `main` y decisiones posteriores autorizadas. Toda fila no documentada sigue `NO_VERIFICADO_MAIN`.
- Revisar que cada pasaje clasificado como contexto realmente no es obligación autónoma olvidada; no basta su etiqueta.
- Obtener revisión humana y pruebas de comportamiento por agente, sin autocertificación.
- Actualizar matrices ante cambio de SHA o evidencia posterior.
