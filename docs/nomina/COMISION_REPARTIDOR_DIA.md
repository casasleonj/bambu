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

- **Origen de la comisión:** embarques cerrados del trabajador (por `Embarque.fecha`) más las entregas a domicilio sin embarque, por la fecha y responsable de cada hecho verificable, incluidas las parciales (#669). Día de Bogotá. `entregadoAt` queda como excepción para pedidos completos anteriores sin capturas detalladas, no como sustituto de los hechos disponibles.
- **Quién cobra:** trabajadores activos con moto y tipo de pago COMISION o MIXTO. Una tarifa en 0 significa «sin definir» y usa `COM_REPARTIDOR` (y si no existe, 200; botellón 200) (#500).
- **Pagar:** el monto lo pone el servidor (comisión del día menos lo ya pagado). `montoEsperado` detecta una pantalla desactualizada (409 `MONTO_CAMBIO`). `offlineId` único evita el doble toque; dos personas a la vez pagan una sola vez (transacción Serializable).
- **Un registro por pago:** si luego sube la comisión del mismo día, se paga la diferencia con otro registro.
- **Caja:** el cierre resta las comisiones **pagadas en efectivo** ese día (`createdAt` del pago), tanto de reparto como de producción (#305, #645). La comisión calculada o pendiente no sale automáticamente de la caja. La cifra que mande el cliente se ignora. Un pago hecho después del cierre cae en la caja del día siguiente.
- **Pendiente al cerrar:** no bloquea el cierre. Esa comisión se paga con la nómina del período.
- **Nómina:** `total = max(0, comisiones − pagado en caja) + salario − descuentos`. Si se pagó de más (por ejemplo se anuló una entrega después), la parte de comisión queda en 0 y el salario no se toca; el excedente se ve en `comisionPagadaCaja > totalComisiones`.
- **Día cubierto por una nómina:** ya no se paga por la caja (409 `NOMINA_EXISTENTE`).
- **Cierres importados** (histórico) no generan pagos; no se generan nóminas de esos períodos.
- **Reabrir o borrar un cierre** no existe en la aplicación. Los pagos no dependen del cierre, así que no queda nada huérfano; V16 avisa si el total pagado en un día deja de coincidir con el cierre.

## Atribución por misión y detalle verificable (#499, #523)

- La entrega física atribuida a una misión pertenece a su repartidor aunque el Pedido se reasigne después. Un pedido atendido con tres unidades en A y dos en B acredita 3 y 2; no 0 y 5. El medio de cobro y el cobrador no cambian esa atribución.
- Modo vivo: se leen los eventos `ENTREGA_PEDIDO`, los deltas `CIERRE` y las nuevas `VENTA_RUTA`. No se vuelve a sumar el acumulado comercial. Sustituciones y promociones no son entregas de venta adicionales. Un pedido cuyo canal original sea Punto puede tener ejecución domiciliaria posterior: se conserva su canal y se usa la evidencia física.
- Legado: si el Pedido tiene eventos atribuidos a otra misión, el acumulado no se acredita al último embarque histórico: requiere conciliación. Sin esa evidencia contradictoria, los embarques sin procedencia viva conservan la excepción histórica por pedidos domiciliarios entregados. No se fabrican eventos ni se reconstruye el reparto de documentos ausentes. Las actividades históricas cumplidas sin evidencia suficiente exigen revisión.
- Entregas tardías (`posCierre`) o sin identidad verificable se muestran **Por conciliar**. El subtotal identificado no se presenta como total definitivo. Se impide un pago nuevo y una nómina AUTO del trabajador afectado; el cierre sigue disponible, los demás trabajadores pueden cobrar y el replay de un pago previo conserva su resultado. No se ejecuta ninguna reparación histórica ni se cambia un pago existente.
- El cierre de embarque, incluido su preview transaccional, usa la misma regla de unidades × tarifa de reparto que nómina. Se retiró la estimación con tarifa de sellado y el porcentaje residual del 5%. Un trabajador FIJO no adquiere comisión por aparecer en el cierre.
- El panel del cierre diario permite abrir **Ver entregas y cálculo**: cantidades, tarifa por producto y enlaces a las misiones o pedidos fuente. Calcular no equivale a pagar; la caja solo resta los pagos registrados.
- Las nuevas nóminas usan inicio y fin del día de Bogotá (#523), igual que la vista diaria: una entrega de las 23:30 pertenece a ese día. Las nóminas ya guardadas conservan sus fechas, tarifas e importes; no se recalculan de oficio.

Límites: la excepción histórica por acumulados no prueba quién hizo cada entrega si nunca existieron eventos. Las tarifas actuales no constituyen un historial de cambios de tarifa; las nóminas y pagos ya registrados mantienen sus importes originales. El detalle vivo es un cálculo con la evidencia disponible, no una reescritura de esos registros.

## Parciales sin embarque: contar lo entregado, no esperar a completar (#669)

- Una entrega de 3 unidades de un pedido de 5 acredita 3, aunque siga `PENDIENTE`. Si se completan las otras 2 mañana, cada día conserva 3 y 2; no se trasladan las 5 al último `entregadoAt`.
- La fuente común `leerEntregasConsulta` conserva fecha, repartidor y cantidades por entrega y deduplica el movimiento espejo. El cierre, la consulta diaria, el pago y la nómina usan la misma función de comisión. Una captura moderna ilegible, incompleta o de versión desconocida exige revisión; nunca se reclasifica como un registro antiguo para pagar el acumulado.
- Se conserva la excepción de pedidos completos sin captura detallada. Un parcial histórico sin cantidades verificables, o un histórico con fechas/responsables contradictorios, queda por conciliar. No se reconstruyen entregas ausentes.
- Un pedido con entregas atribuidas a embarques no vuelve a acreditar su acumulado por quedar desvinculado. La revisión de la oficina afecta a su responsable o a su captura propia; descubrir el mismo pedido en el rango no bloquea por sí solo al repartidor que ya tiene la entrega verificada en su misión.
- La oficina sigue rechazando cambiar el repartidor de un pedido parcialmente atendido (`REPARTIDOR_DISTINTO`). Apagar la gestión directa impide nuevas capturas, pero no borra las entregas ya registradas.
- Si ya se pagaron 203 unidades y la cifra correcta aumenta a 206, solo queda la comisión de 3. El replay del pago conserva su resultado y la pantalla desactualizada recibe `MONTO_CAMBIO`. No se reescriben nóminas, pagos ni cierres guardados.

Pruebas: `integration/comision-parciales-669.test.ts` (datos sintéticos, PostgreSQL y handlers reales), `nomina-comision-sin-embarque.test.ts`, `comision-repartidor-dia.test.ts`, `pago-comision-repartidor.test.ts`, `comision-salario-medio-pago-305.test.ts` y `e2e/comision-repartidor-dia.spec.ts` (cantidades, enlace de detalle y pago de la diferencia). La regresión de partida reproduce 203 en vez de 206 y cero pendiente en vez de la comisión de las 3 unidades.

## Detalle por pedido en «Ver entregas y cálculo» (#622)

El desglose muestra, dentro de cada embarque o pedido sin embarque, la lista de pedidos con su negocio (primero) o cliente, lo entregado **en esta comisión** y, aparte, lo pedido, lo entregado hasta ese día y lo pendiente. Una entrega cuenta en el día en que ocurrió y por quien la hizo, no en el día en que se creó el pedido: un pedido de 10 con 5 entregadas ayer y 5 hoy muestra 5 y 5, «Completó hoy» en el día de hoy y «5 de 10 · se completó después» en el cierre de ayer. Las unidades por pedido más las «ventas en ruta (sin pedido)» suman exactamente las del embarque. Es solo lectura: no cambia unidades, tarifas, pagos ni nómina, y si el detalle por día no se puede verificar se dice «sin detalle verificable» y se conserva «Por conciliar».
