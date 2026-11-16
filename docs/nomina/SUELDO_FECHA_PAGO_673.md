# Sueldos con fecha de pago opcional (#673, punto 2)

Los sueldos fijos se pagan cada cierto tiempo, pero a veces se **atrasan o se adelantan**. Hasta ahora, al pagar un sueldo,
`Nomina.fechaPago` y la fecha del egreso (`Gasto.fecha`) se fijaban en el momento de la captura, aunque el dinero se hubiera
entregado otro día. Esta fase permite indicar el día real, **solo si la persona quiere**.

## Alcance
- **Entra:** sueldos fijos (`PUT /api/nomina/[id]` acción PAGAR y `POST /api/nomina/sueldo/pagar`) y su pantalla «Sueldos que tocan».
- **No entra:** las **comisiones** de repartidores y selladores. Su fecha real de caja la resuelve #770 con
  `PagoComisionRepartidor.fechaPagoReal` (columna ya aplicada en producción). Este PR no añade ninguna columna ni migración.
  Por la misma razón no hay aquí una corrección administrativa de fechas de comisión: se construiría sobre `fechaPagoReal`
  cuando #770 esté fusionado.

## Reglas
- Sin fecha, o con la de hoy: el pago es el de siempre y el cuerpo de la solicitud no cambia.
- Fecha pasada: exige motivo (3 letras o más) y deja rastro. Fecha futura o inexistente: 422 (`FECHA_PAGO_FUTURA`,
  `FECHA_PAGO_INVALIDA`); sin motivo: 422 `MOTIVO_FECHA_REQUERIDO`.
- `Nomina.fechaPago` y `Gasto.fecha` (lo que lee el cierre de caja) caen ese día, al mediodía de Bogotá. `Gasto.createdAt` conserva
  la captura y `Gasto.notas` el motivo.
- **No cambia el periodo que cubre la nómina** (`fechaInicio`/`fechaFin`): solo cuándo salió el dinero.
- El egreso solo existe si se paga en efectivo dentro de la caja (#641); por Nequi, Daviplata, transferencia o por fuera de la caja
  se guarda la fecha pero no hay egreso.
- `sueldo/pagar` valida la fecha **antes** de crear la nómina del día: un rechazo no deja una nómina pendiente suelta.
- Un día ya cerrado no bloquea (el dinero salió ese día). El cierre guardado **no se reescribe**.

## Límite que conviene conocer
El egreso queda en el día elegido. Si ese día ya está cerrado, su cierre guardado conserva la cifra original y el egreso solo se
ve en consultas que lean `Gasto` en vivo. **Este PR no añade** el bloque «Ajustes posteriores al cierre» de la maqueta 6; hace falta
decidir su alcance junto con #770, que ya presenta aparte la consulta actual del cierre. Tampoco hay una regla del verificador sobre `Gasto`.

## Pantalla (maqueta del PO, tablero 4)
Un enlace «Lo pagué otro día» recogido por defecto. Al abrirlo: «¿Qué día lo pagaste?» (hasta hoy) y «¿Por qué se anota con otra fecha?»,
con la nota «No cambia el periodo que cubre este sueldo». El aviso de caja pasa a «Sale de la caja del <día> (efectivo)». La confirmación
añade el día y el motivo. Los errores salen junto al campo; mientras se guarda, todo queda desactivado.
