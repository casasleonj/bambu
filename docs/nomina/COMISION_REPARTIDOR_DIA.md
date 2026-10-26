# Comisión del repartidor por día (#499)

La comisión se calcula sola; el **pago** es un toque deliberado, porque es dinero que sale de la caja.

## Piezas

| Pieza | Dónde |
|-------|-------|
| Cálculo (fuente única de nómina, vista del día y cierre) | `src/lib/comision-repartidor.ts` |
| Pagos, estado del día y cifras del cierre | `src/lib/comision-pagada.ts` |
| Tabla de pagos | `PagoComisionRepartidor` (migración `20261027_pago_comision_repartidor`) |
| Ver el día | `GET /api/nomina/dia?fecha=` (ADMIN/CONTADOR) |
| Pagar | `POST /api/nomina/dia/pagar` (ADMIN/CONTADOR) |
| Cierre de caja | `POST /api/cierre` y `POST /api/cierre-dia` calculan `comisiones` en el servidor |
| Nómina del período | `POST /api/nomina` descuenta lo pagado (`Nomina.comisionPagadaCaja`) |
| Verificador | regla V16 (`src/lib/integridad/reglas.ts`) |

## Reglas

- **Origen de la comisión:** embarques cerrados del trabajador (por `Embarque.fecha`) más, mientras exista la gestión temporal de #472, las entregas a domicilio sin embarque (por `entregadoAt`). Día de Bogotá.
- **Quién cobra:** trabajadores activos con moto y tipo de pago COMISION o MIXTO. Una tarifa en 0 significa «sin definir» y usa `COM_REPARTIDOR` (y si no existe, 200; botellón 200) (#500).
- **Pagar:** el monto lo pone el servidor (comisión del día menos lo ya pagado). `montoEsperado` detecta una pantalla desactualizada (409 `MONTO_CAMBIO`). `offlineId` único evita el doble toque; dos personas a la vez pagan una sola vez (transacción Serializable).
- **Un registro por pago:** si luego sube la comisión del mismo día, se paga la diferencia con otro registro.
- **Caja:** el cierre de un día resta lo pagado ese día (`createdAt` del pago) más la comisión de sellador de Producción. La cifra que mande el cliente se ignora. Un pago hecho después del cierre cae en la caja del día siguiente.
- **Pendiente al cerrar:** no bloquea el cierre. Esa comisión se paga con la nómina del período.
- **Nómina:** `total = max(0, comisiones − pagado en caja) + salario − descuentos`. Si se pagó de más (por ejemplo se anuló una entrega después), la parte de comisión queda en 0 y el salario no se toca; el excedente se ve en `comisionPagadaCaja > totalComisiones`.
- **Día cubierto por una nómina:** ya no se paga por la caja (409 `NOMINA_EXISTENTE`).
- **Cierres importados** (histórico) no generan pagos; no se generan nóminas de esos períodos.
- **Reabrir o borrar un cierre** no existe en la aplicación. Los pagos no dependen del cierre, así que no queda nada huérfano; V16 avisa si el total pagado en un día deja de coincidir con el cierre.
