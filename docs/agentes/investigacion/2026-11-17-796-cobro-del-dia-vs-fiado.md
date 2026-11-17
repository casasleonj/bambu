# #796 · Cobro del día de la entrega vs. abono de fiado — investigación (3 iteraciones)

**Estado:** `DISEÑO CONVERGIDO (CONDICIONADO)`. No hay código de producto. Pendientes: aprobación del plan y maquetas UI del PO.
**Base:** `main` @ 9a9a55a. **Investigó:** Claude Sonnet 5.5 (por indicación expresa del PO el 17-nov-2026, en lugar de Codex del protocolo #704; **sin contraste de otro modelo**). **Producción:** solo lectura, sin datos personales, 17-nov-2026.
**Límites declarados:** Contexto Maestro no accesible desde este repo; la pantalla autenticada no se navegó; ninguna prueba ejecutada.

## Decisiones del PO recibidas (17-nov-2026)
1. Corte = **día calendario de Bogotá** (el que ya usa el Cierre: `startOfDayBogota`/`endOfDayBogota`).
2. «Crear pedido ≠ facturar» está vigente en **#840** (issue aparte, P0). #796 no debe depender de que exista `Factura`/`Abono`.
3. Histórico del fiado a fecha de corte: **snapshot**.
4. Lectura de producción de solo lectura: autorizada.

## Iteración 1 · Descubrimiento (R1)
| ID | Hecho | Fuente | Certeza |
|---|---|---|---|
| H1 | `pagar-fiado` crea `Pago` + `Abono ESPEJO_PAGO`; `/api/abonos` y `/api/cartera/abonos` listan todos los abonos sin distinguir espejo ni día de la venta | `pagar-fiado/route.ts:158-161`, `abonos/route.ts:28`, `cartera/abonos/route.ts:52` | HECHO (código) |
| H2 | El Cierre no cuenta el espejo dos veces (`clasificarCobroCartera`). Es un problema de clasificación, no de caja | `cobro-cartera.ts:81-209` | HECHO |
| H3 | `desglosarCobros` clasifica por `Pedido.fecha` (creación) | `cierre-desglose-cobros.ts:56` | HECHO |
| H4 | `fiado`/`fiadosDelDia` del Cierre usan exigible **actual** (sin corte) | `cierre-resumen.ts:164-165,250` | HECHO |
| H5 | **#1119**: 20 pacas, 10 entregadas 12:12 (13-nov), reducción comercial del remanente 18:32 (NC-00050), pago $23.000 EFECTIVO 18:35 + Abono espejo | Prod + `Historial` | HECHO (prod) |
| H6 | #1084 y #1095: creados 12-nov, entregados y cobrados 13-nov ~11:54 (`Pedido.entregadoAt`); #1017 entregado 11-nov 17:11, cobrado (NEQUI, REPORTADO) 13-nov | Prod | HECHO (prod) |
| H7 | `Pedido.fechaEntrega` está en **NULL en los 1.190 pedidos**; no sirve como fuente | Prod | HECHO (prod) |
| H8 | `Pedido.entregadoAt` está en 282 de 345 ENTREGADO desde el 06-nov; `EntregaExigible` cubre 266 de 345 (desde el 06-nov) | Prod | HECHO (prod) |
| H9 | `Pago.ocurridoAt` (fecha efectiva) es NULL en los 4 casos; el Cierre usa `Pago.createdAt` | Prod + `cierre-resumen.ts` | HECHO |
| H10 | `EntregaExigible.entregadoAt` es `timestamp` **sin zona** (UTC); `Pago`/`Pedido`/`Abono` son `timestamptz`. Error de zona fácil de cometer | `information_schema` | HECHO (prod) |

## Iteración 2 · Contraste y refutación (R2)
- **Impacto medido (6–16 nov, ~300 pagos):** por fecha de entrega en vez de creación solo cambian **3 pagos** de categoría (2 el 13-nov = #1084/#1095, 1 el 16-nov), todos «fiado anterior» → «venta del día». Ninguno pasa en sentido contrario. El daño de cifras es **pequeño pero sistemático**; el daño de *interpretación* (Cartera) es mayor.
- **Refutación de «usar `Pedido.fechaEntrega`»:** vacío en todo el universo. Descartada.
- **Refutación de «usar solo `EntregaExigible`»:** faltan hechos en 81 pedidos ENTREGADO (76 pagados, 5 con saldo) y en todos los anteriores al 06-nov. Insuficiente solo.
- **Refutación del parche en Cartera (A):** el desglose del Cierre seguiría mal. Descartada.
- **Interacción con #840:** si la factura deja de nacer con el pedido, `Abono` (que exige factura) deja de ser fuente fiable de «cobros». La clasificación debe leer `Pago` + hechos de entrega.
- **Adversariales trazados (del mandato):** pago que cubre porciones de varias jornadas (imputación FIFO por porción), pago REPORTADO sin confirmar, pago con fecha efectiva ≠ captura, regularización (`regularizacionId`), reducción comercial del remanente (#1119), reintento/offline.
- **Cierres no guardados:** solo 6 `CierreDia`, el último del 05-nov. Un snapshot que dependa del cierre manual **no existiría** para el 12 y 13-nov.

## Iteración 3 · Convergencia
**Clasificador único de fecha de entrega** (reutiliza `leerEntregasConsulta` / `unidades-entregadas-dia`, #650), con cascada y marca de precisión:
1. Porciones de `EntregaExigible` (`entregadoAt`, interpretado como UTC).
2. `Pedido.entregadoAt`.
3. Fecha de creación, marcado **aproximado** («por conciliar»), igual que #650 y #656. Nunca se fabrica precisión.

**Regla de cobro (por `Pago`, día Bogotá de `ocurridoAt ?? createdAt`):** se imputa FIFO a porciones entregadas (mismo orden que `pagar-fiado`). Parte cuyo día de entrega = día del pago → *cobro de venta del día*; parte de una entrega anterior → *recuperación de cartera*. Pedido de una sola entrega: basta comparar día de entrega y día de pago.

**Espejo:** `Abono ESPEJO_PAGO` se conserva (trazabilidad). En Cartera no se presenta como «abono de fiado» cuando su pago es cobro del día; el total de abonos de cartera excluye espejos de ese tipo.

**Fiado a corte (fase 2, snapshot por decisión del PO):** foto diaria automática del fiado pendiente al corte (00:00 Bogotá), **no atada al cierre manual** (cron idempotente, como `vencimiento-promesas`). Sirve la consulta «ayer». Desde la fecha de adopción hacia adelante. El hoy sigue en vivo y provisional.

### Alternativas
| | Decisión |
|---|---|
| A. Parche de presentación en Cartera | Descartada |
| B. Clasificador compartido calculado al leer | **Elegida (fase 1)** |
| C. Snapshot diario persistido | **Elegida (fase 2)**; migración aditiva, plan de reversión pendiente |

### Fases (una rama, un PR)
- **Fase 1:** clasificador + Cierre (desglose) + API/UI de Cartera. **Requiere maquetas aprobadas.** Sin migración.
- **Fase 2:** tabla de snapshot + cron + lector «a fecha de corte». Migración aditiva e idempotente; verificación previa en producción solo con autorización.

## Decisiones pendientes del PO
1. **Backfill 06→16-nov:** ¿reconstruir una foto «reconstruida» con los hechos disponibles (etiquetada como tal) o empezar a partir de la fase 2? Se recomienda lo primero, solo para pedidos con hechos.
2. **Pedidos sin fecha de entrega fiable (81 recientes):** confirmar que se clasifican por creación y se rotulan «aproximado».
3. **Maquetas UI** (escritorio y móvil, estados de confirmación/carga/error) de Cartera y del desglose del Cierre.
4. **Coordinación:** #749 y #656 abiertos; #840 define si el cobro dejará de exigir factura.

## No tocar
Cierres guardados, cantidades y pagos originales, trazabilidad (`Abono` espejo, `Historial`), fechas de inventario y comisiones (#673), reglas de #840.
