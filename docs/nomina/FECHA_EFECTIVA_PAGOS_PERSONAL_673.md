# Fecha efectiva de caja de los pagos al personal (#673, punto 2)

**Estado:** PR A (backend, sin pantalla). La pantalla —el campo «¿Cuándo se lo entregaste?»— es el PR B, con maquetas aprobadas.

## El problema
Cada pago de comisión guardaba dos fechas y cada lector usaba una distinta: el cierre restaba por `createdAt` (cuándo se anotó), la nómina por `fecha` (día del trabajo). Un pago entregado el lunes y anotado el miércoles restaba del cierre del miércoles. Los sueldos fijaban `Nomina.fechaPago` y `Gasto.fecha` en `new Date()` al pagar.

## Decisión del PO (2026-11-16)
1. Cierres consolidados: **mejor práctica contable**. Un periodo cerrado no se reabre ni se reescribe; el pago se registra con su fecha real, con motivo y rastro, y la diferencia queda explicada. Es el patrón habitual de ajustes sobre periodos cerrados (se corrige en el periodo abierto o con una conciliación referenciada, con motivo, autor y evidencia).
2. En pagos nuevos se puede indicar la fecha en que se entregó el dinero.
3. En sueldos la fecha es **opcional**: pueden atrasarse o adelantarse; sin indicarla se comporta como siempre.

## Qué cambia
| Pieza | Antes | Ahora |
|---|---|---|
| `PagoComisionRepartidor.pagadoAt` | no existía | Fecha efectiva de caja. `NULL` = `createdAt` (todo lo anterior y el pago normal). Aditiva y nullable. |
| `PagoComisionFechaCorreccion` | no existía | Correcciones append-only: fecha anterior y nueva, motivo, autor, `offlineId`. Sin UPDATE ni DELETE. |
| Cierre de caja (`comisionPagadaEnCaja` / `OtrosMedios`) | por `createdAt` | por `COALESCE(pagadoAt, createdAt)` |
| `POST /api/nomina/dia/pagar` | sin fecha de entrega | acepta `pagadoEl` (YYYY-MM-DD) y `motivoFecha`; hoy o sin fecha = pago normal |
| `POST /api/nomina/pagos-comision/[id]/corregir-fecha` | no existía | solo ADMIN, motivo obligatorio, idempotente |
| `PUT /api/nomina/[id]` (PAGAR) y `POST /api/nomina/sueldo/pagar` | `fechaPago`/`Gasto.fecha` = ahora | aceptan `fechaPago` y `motivoFecha`; `Gasto.createdAt` conserva la captura |
| V16 | por `createdAt` | por la fecha efectiva **que el pago tenía al hacerse el cierre** |

## Reglas
- Fecha futura: 422 `FECHA_PAGO_FUTURA`. Fecha pasada sin motivo: 422 `MOTIVO_FECHA_REQUERIDO`.
- **Día ya cerrado: se acepta.** El cierre guardado no cambia. Un pago anotado después con la fecha de un día cerrado queda explicado por su fecha efectiva y su rastro; un pago normal hecho después del cierre sigue marcándose en V16.
- Nunca se reescribe `createdAt` ni `fecha`, ni se borra un movimiento. El periodo que cubre una nómina no cambia.
- Diferencia con #617 (cobros de clientes): allí un día cerrado se rechaza porque la fecha efectiva no mueve caja; aquí sí decide en qué cierre resta el dinero.

## Despliegue
Migración `20261116_pago_comision_fecha_efectiva`: aditiva e idempotente (columna nullable + tabla nueva + CHECK + GRANT a `app_write`). El código anterior no la necesita, por lo que se aplica en producción **antes** del merge, con autorización y verificación de solo lectura. `git revert` no revierte la tabla ni la columna.

## Pendiente (fuera de este PR)
- PR B: campo en «Pagar» y corrección de la ayuda «ya le diste hoy» (maquetas de escritorio y móvil, aprobación del PO).
- Casos históricos reales: solo con evidencia del propietario; no se infiere por fecha ni por importe.
- Sueldos: V16 solo cubre comisiones; no se añadió una regla para `Gasto`.
