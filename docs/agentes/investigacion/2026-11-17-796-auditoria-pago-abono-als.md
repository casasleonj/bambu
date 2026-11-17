# #796 · Auditoría de Pago/Abono, correcciones, espejos históricos y matriz ALS

**Estado:** `INVESTIGACIÓN` (solo lectura). No cambia contratos, datos ni producción. Base: `main` + rama `ccr-7bd580d5-4itx13`.
**Autorizado por el PO (17-nov-2026):** auditar correcciones y permisos; investigar los 97 espejos en solo lectura; leer ALS y construir la matriz.
**Fuentes leídas completas:** `docs/pedidos/CUMPLIMIENTO_PARCIAL_ALS_v2.md`, `docs/adr/ADR-CORRECCION-MONETARIA-001.md`, la ruta `cartera/abonos/[id]/corregir` y `pagos/[id]/confirmar`, `permissions.ts`. **Leídas solo en parte (grep, no lectura completa):** `AGUA_BAMBU_N2_ALS_v2.0.md` (tema diferencial/pendiente; sin efecto directo en cobros), `ADR-PAGO-REPORTADO-CONFIRMADO-001` (§3-§4). **No accesible:** Contexto Maestro.

## 1. Auditoría de las correcciones (`MONTO`, `CLIENTE`, `FACTURA`, `NO_RECIBIDO`)

| Aspecto | Hecho verificado en código/ADR | Observación |
|---|---|---|
| Ancla | `CorreccionAbono.abonoId` es **obligatorio** (ADR D.3). Solo se corrige un `Abono`. | Un `Pago` sin abono **no tiene camino de reversión** (ver §4). |
| Efecto | Crea `CorreccionAbono` + `ReceivableEntry REVERSION`; recalcula `Pedido.totalPagado/saldo/estadoPago` y `Factura.montoPagado/saldo/estado`. **No toca** el `Abono` ni el `Pago` (append-only). | Tras una corrección `Σ Pago ≠ Pedido.totalPagado` por diseño; el rastro está en `CorreccionAbono`. |
| Tipos | `MONTO` admite reversión parcial; `CLIENTE`, `FACTURA` y `NO_RECIBIDO` revierten el saldo no revertido. | `CLIENTE` y `FACTURA` **solo revierten**: no reaplican el cobro al cliente o factura correctos (hay que registrar un cobro nuevo aparte). El nombre sugiere más de lo que hace. |
| `NO_RECIBIDO` | Además abre `ResponsibilityCase PAGO_NO_CONFIRMADO`. | Es el único tipo con consecuencia de investigación. |
| Invariantes | `monto > 0`; `yaRevertido + revertir ≤ monto`; idempotente por `correccionOfflineId`; bloqueo si pedido/factura `ANULADO`. | `CANCELADO` **no** se bloquea (solo `ANULADO`). |
| Concurrencia | Lock `CARTERA:{cliente}` + `SECUENCIA:correccionAbono` (como dice el ADR). Escribe `totalPagado` **absoluto** leído dentro de la tx. | **Riesgo inferido por lectura, sin prueba de carrera:** un flujo que solo toma `PEDIDO` (cobro/entrega del repartidor) podría pisar o ser pisado. No lo reproduje. |
| Auditoría | `logAudit` en la misma tx; motivo, responsable (`autorizadoPorId`), importe, fecha. | Los valores anteriores y posteriores del pedido/factura **no** se guardan en el registro; hay que reconstruirlos desde `ReceivableEntry`. Condición 3 del PO: brecha parcial. |
| Uso real | `CorreccionAbono` en producción: **0 filas**. | La ruta nunca se ha ejercitado con datos reales; solo con 9 pruebas de integración. |

### Tres conceptos que hoy están mezclados
| Concepto | Existe hoy | Dónde |
|---|---|---|
| **Registro erróneo** (monto, cliente o factura equivocados) | Sí | `CorreccionAbono` `MONTO`/`CLIENTE`/`FACTURA` |
| **Rechazo de un pago** (no entró) | **A medias.** `DISCREPANTE` marca el `Pago` y abre el caso, pero **no revierte el dinero** (ADR-PAGO-REPORTADO §4). La reversión real "va por ADR-CORRECCION", es decir, por un `Abono`. | `pagos/[id]/confirmar` + `NO_RECIBIDO` |
| **Devolución efectiva del dinero** al cliente | **No existe para pagos.** Solo existe devolver **saldo a favor** (#560, `devolver-saldo-favor.ts`). | No confundir con una devolución de pago |

**Consecuencia directa:** si se deja de crear el abono, la cadena del ADR (*pago `DISCREPANTE` → resolución → reversión vía `CorreccionAbono`*) se rompe para ese pago. Dejar de crear espejos exige antes un incremento del ADR que permita corregir un `Pago`.

## 2. Permisos (condición 3 del PO)

| Acción | Quién | Fuente |
|---|---|---|
| Ver Cartera y listar abonos | ADMIN, CONTADOR (`view:cartera`) | `permissions.ts`; ASISTENTE no |
| Corregir un abono | ADMIN, CONTADOR | `corregir/route.ts`; fijado por `roles-309.test.ts` |
| Cobrar un fiado | ADMIN, ASISTENTE | #309, **separación de funciones intencional**: quien cobra no revierte |
| Confirmar o marcar `DISCREPANTE` un pago | Un único usuario configurado (`USUARIO_CONFIRMA_PAGOS`) | ADR-PAGO-REPORTADO §3 |

Son **tres autoridades distintas** (cobrar, confirmar, revertir). Cualquier ruta nueva que corrija un `Pago` debe conservar exactamente estas tres y la prueba `roles-309`. Un ADMIN ya reúne cobrar y revertir (la separación no aplica a ADMIN).

## 3. Los 97 espejos de producción (solo lectura, 17-nov-2026)

| Verificación | Resultado | Clasificación |
|---|---|---|
| Vínculo íntegro (mismo monto, medio y pedido que su `Pago`, regla V17) | 97 de 97 | **Confirmado** |
| Nacieron junto con su pago (≤ 2 s) | 97 de 97 | **Confirmado** (es `pagar-fiado`) |
| Con correcciones aplicadas | 0 | Confirmado |
| Pago aún no `CONFIRMADO` (`REPORTADO`) | **39** | Confirmado |
| Con fecha efectiva distinta (`ocurridoAt`) | 6 | Confirmado |
| Pedidos con más de un espejo | 14 | Confirmado |
| Espejo sobre un pedido `ANULADO` | 1 (#1055, $23.000) | Confirmado; el Cierre ya excluye `ANULADO` |

### Los 22 candidatos a «cobro del mismo día» (fecha de entrega = fecha del pago)
| Evidencia de la fecha de entrega | Espejos | Del mismo día | Monto del mismo día | Pago sin confirmar |
|---|---|---|---|---|
| **Confirmada** (hecho de entrega, `EntregaExigible`) | 27 | 4 | $119.600 | 2 |
| **Inferida** (`Pedido.entregadoAt`) | 44 | 12 | $118.300 | 5 |
| **Aproximada** (fecha de creación) | 26 | 6 | $36.300 | 3 |
| **Total** | 97 | **22** | **$274.200** | **10** |

- Solo **4 de los 22** descansan en un hecho de entrega confirmado; 6 son aproximados.
- **10 de los 22 son pagos digitales aún `REPORTADO`**: justo los que pueden fallar y necesitarían reversión.
- Anomalía puntual: el pedido #803 tiene fecha de entrega distinta en el hecho (05-nov 15:58) y en `Pedido.entregadoAt` (06-nov 17:34).
- **Nada se modificó ni se reclasificó.** Esto es solo lectura.

### Abonos que no son espejos (35 en total)
| Grupo | Abonos | Monto | Evidencia |
|---|---|---|---|
| `INDEPENDIENTE` (registrados a mano, con `offlineId`) | 10 | $388.000 | **Confirmada** |
| Sin origen, con `CREATE` auditado | 4 | $36.400 | Confirmada (procedencia probada) |
| Sin origen y **sin ninguna prueba** | **21** | **$463.600** | **Desconocida** → el repo los llama «Por conciliar» |

### Defecto mío hallado con estos datos y ya corregido
Mi regla de Cartera escondía también abonos que **no** son espejos verificados: 8 abonos antiguos ($84.200), 5 de ellos sin procedencia ($52.200). Ahora **solo se esconde un espejo verificado** (con su `Pago` de origen). Un abono independiente o de origen desconocido se lista siempre, completo y sin etiqueta. Prueba: `cartera-origen-796.test.ts`.

## 4. Matriz de compatibilidad (ALS · decisión del PO · arquitectura · solución · prueba)

| # | Requisito | Fuente | Arquitectura actual | Solución propuesta | Prueba |
|---|---|---|---|---|---|
| 1 | Obligación ≠ cumplimiento ≠ cobro ≠ documento fiscal | ALS §1 | `EntregaExigible`, `Pago`, `Factura` separados | Clasificador lee entregas y pagos; no usa `Factura` | Unit 21 + integración ✔ |
| 2 | No crear modelos paralelos / sin `Fulfillment` | ALS §4, §33 | — | Se **eliminó** el FIFO duplicado: usa `asignarPagoFIFO` | Revisión + unit ✔ |
| 3 | Pagos históricos inmutables; `total` y `totalPagado` no bajan por una parcial | ALS §6, GATE A | `Pago` no se edita; corrección es append-only | Sin cambios; mantener | Existentes; ver brecha F2 |
| 4 | Sin `PaymentAllocation` hasta demostrar necesidad | ALS §9 | La asignación se calcula al leer (FIFO sobre hechos) | Paso 0 no crea tabla. **Necesidad por demostrar en la fase 2** (foto a corte), porque `proyectarPagoFIFO` recalcula desde cero | Pendiente |
| 5 | Factura no se reescribe destructivamente | ALS §19 | `corregir` y `pagar-fiado` actualizan `saldo/montoPagado/estado` (proyección) | Mantener; el historial de pagos de la factura debe salir de `Pago`, no de `Abono` (paso 1) | Pendiente (maqueta) |
| 6 | Cierre separa cobro histórico del nuevo | ALS §20 | Cierre de **embarque** (`PAGOS_EXCEDIDOS`) | **No verificado** en este trabajo | Pendiente |
| 7 | Idempotencia y offline | ALS §23 | `offlineId` en `Pago`, `Abono`, `correccionOfflineId` | Sin cambios; dejar de crear espejos no toca la deduplicación | Existentes |
| 8 | Concurrencia: la obligación es el lock | ALS §24 | `corregir` solo bloquea `CARTERA` | Evaluar añadir `PEDIDO` en el paso 2 | **Sin prueba de carrera** |
| 9 | Migración expand/contract; legado legible | ALS §25 | Hay 97 espejos y 25 abonos antiguos | Paso 3 detrás de bandera apagada; lectores compatibles | Pendiente |
| 10 | Observabilidad de discrepancias | ALS §26 | `pago_discrepante_count` | Agregar contador de cobros «aproximados» y de divergencia clasificador↔espejo | Pendiente |
| 11 | Corte = día calendario de Bogotá | PO 17-nov | `startOfDayBogota` | Ya aplicado | Unit ✔ |
| 12 | Crear pedido ≠ facturar | PO #840 | La factura aún nace con el pedido | Independizar factura de `Abono` (paso 1) | Pendiente |
| 13 | Corrección anclada a abono | ADR-CORR D.3 | `abonoId` obligatorio | **Incremento de ADR** para corregir un `Pago` (paso 2); no rediseñar el catálogo | Pendiente |
| 14 | Quien cobra ≠ quien revierte | ADR-CORR D.2 (#309) | `roles-309.test.ts` | Conservar las tres autoridades sin ampliar privilegios | Extender `roles-309` al `Pago` |
| 15 | `DISCREPANTE` no revierte el pago | ADR-PAGO §4 | Solo marca y abre caso | La reversión de un pago sin abono necesita el ancla del punto 13 | Pendiente |

### Brechas explícitas (ALS ↔ código)
- **F1.** Un `Pago` sin abono no tiene camino de reversión (rompe ADR-PAGO §4).
- **F2.** `Σ Pago ≠ totalPagado` tras corregir: debe documentarse y conciliarse, no ocultarse.
- **F3.** `CLIENTE`/`FACTURA` solo revierten, no reaplican.
- **F4.** La corrección no guarda valores anteriores y posteriores (condición 3).
- **F5.** `corregir` no toma lock de `PEDIDO` y escribe valores absolutos (riesgo inferido).
- **F6.** `CANCELADO` no está bloqueado en `corregir`.
- **F7.** La ruta de corrección nunca se usó con datos reales.
- **F8.** Una corrección posterior resta del día del **pago** (no del día de la corrección) en la vista recalculada; los cierres guardados no se reescriben y existe la señal #712. **A probar** (caso 28).

## 5. Conclusiones y siguiente paso
1. **No se puede dejar de crear espejos todavía.** Está condicionado a F1/F4/F5 y a un incremento de ADR (13).
2. El paso 1 (historial de la factura desde `Pago`) y el paso 2 (corrección anclada a `Pago`) siguen siendo el camino. El paso 2 necesita decidir el **ancla** (p. ej. `pagoId` opcional en `CorreccionAbono`, aditivo) y si se añade el lock de `PEDIDO`. Eso es una **decisión de diseño con migración**, y requiere aprobación antes de implementarse.
3. Los 22 candidatos **no se tocan**. Los 10 con pago `REPORTADO` son prioritarios para cualquier verificación manual del equipo.
