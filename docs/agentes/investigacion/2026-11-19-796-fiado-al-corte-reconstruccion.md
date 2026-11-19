# #796 fase 2 · Fiado «a la fecha de corte»: reconstrucción en lugar de foto

Estado: **DISEÑO PROPUESTO, pendiente de aprobación del PO.** No hay código ni migración. Evidencia de producción de **solo lectura**, autorizada por el PO el 19-nov-2026; aquí solo hay conteos y patrones, sin nombres, números de pedido ni importes reales (repositorio público).

## Problema
`construirResumenCierre` calcula el fiado con el saldo **actual** (`cierre-resumen.ts`, `fiado = Σ exigible actual`). Consultar un día pasado después de que alguien pagó hoy hace bajar el fiado de ese día, que es lo que #796 no quiere. El issue propone una «foto al cierre» pero aclara que es **propuesta**, no decisión, y que pide primero un «estudio de reconstrucción por movimientos».

## Hipótesis y resultado
**Hipótesis:** el fiado a una fecha de corte `C` se puede reconstruir sin migración con movimientos fechados:

`exigible(pedido, C) = max(0, entregado(≤C) − pagos(≤C) + reversiones(≤C))`, con `entregado` al valor que tenía el pedido en `C` (`total actual + Σ NotaCredito con fecha ≥ C`).

**Validación contra la verdad guardada.** Hay 7 cierres guardados (`CierreDia`, 31-oct a 6-nov). Se reconstruyó el fiado de los pedidos de cada día al **instante en que se guardó cada cierre** y se comparó con lo guardado:

| Resultado | Días |
|---|---|
| Coincide **al peso** | 5 de 6 con pedidos (el 7.º no tenía pedidos) |
| Difiere | 1: un pedido que se **entregó después del cierre** y la regla anterior sí contaba como fiado (hoy no lo es, por #656/#796) |

Sin las notas de crédito la coincidencia era 4 de 6: otro día difería por una rebaja comercial aplicada **después** del cierre. Quedó registrada con fecha en `NotaCredito`, y al restarla de la reconstrucción coincidió. Es la prueba de que el valor de un pedido a una fecha es reconstruible.

## Hallazgos que cambian el diseño
1. **El fiado guardado depende de la hora en que se pulsó «cerrar», no del día.** Un cierre se guardó **11 días después** de su fecha; su fiado guardado coincide con la reconstrucción a esa hora de cierre, no con la medianoche de su día (a medianoche daría una cifra muy distinta). El PO decidió corte = **día calendario de Bogotá** (fin del día): con esa regla el fiado de un día no depende de cuándo se cierre.
2. **El libro `ReceivableEntry` no basta solo:** cubre ~88 % de los pagos (desde el 26-ago). Sirve para reversiones (desde el 7-sep). Los pagos salen de `Pago` (`ocurridoAt ?? createdAt`).
3. **`EntregaExigible` existe solo desde el 6-nov.** Antes, la entrega sale de `Pedido.entregadoAt` (presente en el 100 % de los entregados).
4. **`Pedido.total` es mutable** (rebajas comerciales, correcciones de precio, ajustes de cantidad, sustituciones, retornos). Hay seis tablas que lo mueven; **solo `NotaCredito` está validada** como fuente fechada. Las otras cinco quedan por comprobar.
5. **`Pedido` no tiene fecha de anulación.** Hay 105 anulados o cancelados, todos con `Historial` fechado, y 21 llegaron a estar entregados. La fecha es recuperable del historial, **pero no se ha comprobado cómo leerla**.

## Diseño propuesto
- Función pura y de lectura `fiadoAlCorte(db, corte)` que reutiliza `leerExigibles`, `asignarPagoFIFO` y el clasificador de #796 (sin motor paralelo). **Sin migración.**
- Se usa para consultar días pasados en Cierre y en el reporte de Fiados; el día en curso sigue siendo **provisional y en vivo**.
- **Los cierres ya guardados no se reescriben** (restricción 6 del issue).
- Si la reconstrucción falla o falta algún dato, la pantalla lo dice y no inventa una cifra.

## Casos adversos aún sin probar
Entregas parciales (porciones) cruzando la medianoche · pagos de oficina con fecha retroactiva · pedidos anulados después del corte · sustituciones, retornos y ajustes de cantidad · anticipos (pago antes de entregar) · reversión de un pago después del corte · corrección retroactiva de un pago ya reflejado en un día consultado.

## Pruebas previstas
Integración con PostgreSQL con **datos sintéticos** que repliquen cada patrón: pago después del corte, nota de crédito después del corte, entrega después del corte, reversión después del corte, pago de oficina retroactivo, anulación posterior, entrega parcial. Más una prueba de consistencia: la reconstrucción con corte = ahora debe igualar el saldo exigible actual de todos los pedidos.

## Decisiones pendientes del PO
1. ¿Los días **con cierre guardado** mantienen su cifra guardada (inmutable), y los días **sin cierre guardado** muestran la reconstruida «al corte de ese día»?
2. ¿Corte = **fin del día calendario de Bogotá** también para el reporte de Fiados?
3. ¿Cómo se ve para el usuario? Un cambio visible en Cierre/Fiados de días pasados (etiqueta «al corte») necesita **maqueta de escritorio y móvil** antes de implementar.
4. Si la reconstrucción no cubre algún caso adverso, ¿se acepta mostrarlo como «aproximado», o se prefiere la foto al cierre (con migración y su autorización)?

## Estado de #796
Esta fase **no** cierra el issue: quedan los 105 espejos históricos, 21 de los 40 escenarios sin prueba directa y la validación de módulos (clientes, venta rápida, embarques, inventario, nómina, finanzas).
