export type SeveridadAlerta = 'BAJA' | 'MEDIA' | 'ALTA'

export type AlertaTipo =
  | '1ER_PEDIDO'
  | '2DO_PEDIDO'
  | '3RO_PEDIDO'
  | 'MONTO_ANOMALO'
  | 'FIADO_REcurrente'
  | 'CLIENTE_BLOQUEADO'
  | 'DISPUTA_ABIERTA'
  | 'RECLAMACIONES_MULTIPLES'
  | 'RECLAMACION_ACTIVA'
  | 'PROMESA_PROXIMA_VENCER'
  | 'NO_ENTREGADO_REPETIDO'
  | 'DEVOLUCIONES_ANORMALES'
  | 'ROTURAS_ANORMALES'
  | 'DESCUENTO_NO_JUSTIFICADO'
  | 'NOTA_CREDITO_FRECUENTE'
  | 'PRECIO_POR_DEBAJO_TABLA'
  | 'REPARTIDOR_DEUDA_ALTA'
  | 'CLIENTE_NO_VERIFICADO'
  | 'MULTIPLES_PEDIDOS_RAPIDO'
  | 'CAMBIO_PRECIO_BRUSCO'

export interface AlertaItem {
  tipo: AlertaTipo
  severidad: SeveridadAlerta
  detalle: string
  fecha: string
  pedidoId?: string
  embarqueId?: string
  repartidorId?: string
  monto?: number
}

export interface AlertaRow {
  clienteId: string
  nombreCli: string
  telefonoCli: string
  alertas: AlertaItem[]
  severidadMasAlta: SeveridadAlerta
}

export interface GuiaAlerta {
  tipo: AlertaTipo
  nombre: string
  severidad: SeveridadAlerta
  icono: string
  definicion: string
  comoSeAplica: string
  ejemplos: string[]
  soluciones: string[]
  acciones: { label: string; accion: string; variant?: 'primary' | 'secondary' | 'danger' }[]
}

export const GUIA_ALERTAS: Record<AlertaTipo, GuiaAlerta> = {
  '1ER_PEDIDO': {
    tipo: '1ER_PEDIDO',
    nombre: '1er pedido hoy',
    severidad: 'BAJA',
    icono: '🔵',
    definicion: 'Primer pedido del cliente en el día. Se muestra como referencia cuando hay 2+ pedidos hoy, para identificar visualmente el orden cronológico.',
    comoSeAplica: 'Si un cliente tiene 2 o más pedidos hoy, el primero (más antiguo) recibe esta etiqueta. Si solo hay 1 pedido, no se muestra.',
    ejemplos: ['Tienda La Esquina pidió a las 8:00am. A las 2:00pm volvió a pedir. El pedido de las 8:00am muestra "1er pedido hoy" y el de las 2:00pm muestra "2do pedido hoy".'],
    soluciones: ['Verificar que el segundo pedido sea legítimo.', 'Llamar al cliente si el segundo pedido es sospechoso.'],
    acciones: [
      { label: 'Ver pedidos de hoy', accion: 'ver_pedidos_hoy', variant: 'primary' },
      { label: 'Ver historial cliente', accion: 'ver_cliente', variant: 'secondary' },
    ],
  },
  '2DO_PEDIDO': {
    tipo: '2DO_PEDIDO',
    nombre: '2do pedido hoy',
    severidad: 'BAJA',
    icono: '🔵',
    definicion:
      'El cliente ha realizado 2 pedidos en el mismo día. Puede ser legítimo (se le acabó el stock) o indicar que un repartidor está creando pedidos fantasmas para inflar comisiones.',
    comoSeAplica:
      'Se cuenta cuántos pedidos del mismo cliente tienen fecha de hoy (00:00 a 23:59). Si el conteo llega a 2, se dispara esta alerta.',
    ejemplos: [
      'Tienda La Esquina pidió a las 8:00am 2 pacas de agua. A las 2:00pm pidió 3 más porque se le acabó el stock por un evento escolar cercano. Fue legítimo.',
      'Bar El Centro nunca pide 2 veces al día. Hoy aparecen 2 pedidos separados por 15 minutos. El repartidor Juan los creó desde su celular para cobrar doble comisión.',
    ],
    soluciones: [
      'Revisar si los pedidos tienen productos distintos o similares.',
      'Verificar quién creó cada pedido (repartidor vs asistente).',
      'Llamar al cliente para confirmar que realmente pidió 2 veces.',
      'Si es sospechoso, revisar la ruta GPS del repartidor en esos horarios.',
    ],
    acciones: [
      { label: 'Ver pedidos de hoy', accion: 'ver_pedidos_hoy', variant: 'primary' },
      { label: 'Ver historial cliente', accion: 'ver_cliente', variant: 'secondary' },
    ],
  },
  '3RO_PEDIDO': {
    tipo: '3RO_PEDIDO',
    nombre: '3ro+ pedido hoy',
    severidad: 'MEDIA',
    icono: '🟡',
    definicion:
      'El cliente ha realizado 3 o más pedidos en el mismo día. Es estadísticamente muy inusual y amerita revisión inmediata.',
    comoSeAplica:
      'Se cuenta cuántos pedidos del mismo cliente tienen fecha de hoy. Si el conteo es >=3, se dispara esta alerta.',
    ejemplos: [
      'Papelería San José aparece con 3 pedidos hoy: 8:00am, 10:30am y 4:00pm. El dueño confirma que solo pidió a las 8:00am. Los otros 2 son pedidos fantasmas del repartidor.',
      'Tienda La Esquina tiene 3 pedidos el día de un festival local. Todos son legítimos, pero el monto total supera su crédito habitual. Se ajustó el límite temporalmente.',
    ],
    soluciones: [
      'Revisar TODOS los pedidos del día antes de embarcar el tercero.',
      'Confirmar directamente con el cliente cada pedido adicional.',
      'Verificar si los pedidos fueron creados desde el mismo dispositivo/IP.',
      'Si hay indicios de fraude, suspender al repartidor involucrado y revisar sus embarques.',
    ],
    acciones: [
      { label: 'Ver pedidos de hoy', accion: 'ver_pedidos_hoy', variant: 'primary' },
      { label: 'Llamar cliente', accion: 'llamar_cliente', variant: 'secondary' },
    ],
  },
  'MONTO_ANOMALO': {
    tipo: 'MONTO_ANOMALO',
    nombre: 'Monto anómalo',
    severidad: 'ALTA',
    icono: '🔴',
    definicion:
      'El valor del pedido supera el doble del promedio histórico de compras de ese cliente. Detecta pedidos inusualmente grandes que pueden indicar error de digitación, venta no autorizada o fraude interno.',
    comoSeAplica:
      'Se calcula el promedio de todos los pedidos entregados del cliente (excluyendo anulados y cancelados). Si el pedido actual es mayor a 2x ese promedio, se dispara la alerta.',
    ejemplos: [
      'Tienda La Esquina suele pedir $6.000 semanalmente. Hoy aparece un pedido de $60.000 (10x). Resultó ser legítimo: organizaban una fiesta de quinceañera. Se confirmó con una llamada.',
      'Bar El Centro tiene un promedio de $30.000. Un pedido de $90.000 aparece un martes tranquilo. El repartidor admitió que duplicó la cantidad para cobrar comisión extra. Se anuló el pedido.',
    ],
    soluciones: [
      'Revisar el pedido antes de prepararlo o embarcarlo.',
      'Verificar precios aplicados item por item (puede haber error de digitación).',
      'Llamar al cliente para confirmar la cantidad solicitada.',
      'Si el cliente no reconoce el pedido, anularlo inmediatamente y revisar quién lo creó.',
    ],
    acciones: [
      { label: 'Revisar pedido', accion: 'ver_pedido', variant: 'primary' },
      { label: 'Ver precios aplicados', accion: 'ver_precios', variant: 'secondary' },
    ],
  },
  'FIADO_REcurrente': {
    tipo: 'FIADO_REcurrente',
    nombre: 'Fiado recurrente',
    severidad: 'MEDIA',
    icono: '🟡',
    definicion:
      'El cliente acumula 2 o más pedidos con saldo pendiente en los últimos 7 días. Indica que se le está fiando sin control, aumentando el riesgo de impago.',
    comoSeAplica:
      'Se cuentan los pedidos del cliente con saldo > 0 y fecha en los últimos 7 días (excluyendo cancelados/anulados). Si hay >=2, se dispara.',
    ejemplos: [
      'Papelería San José ha fiado 3 pedidos esta semana: lunes $12.000, miércoles $8.000, viernes $15.000. Total adeudado: $35.000. Se bloqueó temporalmente y se acordó plan de pagos.',
      'Tienda La Esquina fiaba ocasionalmente ($6.000 cada 15 días). Esta semana fió 2 veces seguidas por un problema de caja en su negocio. Legítimo, pero se le recordó el límite.',
    ],
    soluciones: [
      'Ir a cobrar personalmente o llamar para recordar el pago.',
      'Revisar el historial de pagos del cliente: ¿siempre paga tarde o es un patrón nuevo?',
      'Si supera el límite de crédito interno, bloquear nuevos pedidos hasta que pague.',
      'Negociar un plan de pagos si el cliente tiene dificultades temporales.',
    ],
    acciones: [
      { label: 'Ir a cobrar', accion: 'ir_cobrar', variant: 'primary' },
      { label: 'Ver cuenta por cobrar', accion: 'ver_cuentas', variant: 'secondary' },
    ],
  },
  'CLIENTE_BLOQUEADO': {
    tipo: 'CLIENTE_BLOQUEADO',
    nombre: 'Cliente bloqueado',
    severidad: 'ALTA',
    icono: '🔴',
    definicion:
      'El cliente tiene una promesa de pago vencida y el sistema lo ha bloqueado automáticamente. No puede realizar nuevos pedidos hasta saldar la deuda.',
    comoSeAplica:
      'El cron diario revisa pedidos con promesaPagoFecha vencida. Si pasa el umbral (default 2 días), marca estadoPago como VENCIDO y bloquea al cliente.',
    ejemplos: [
      'Bar El Centro prometió pagar el lunes $12.000. No pagó. El miércoles el cron lo bloqueó. El repartidor intentó crearle un pedido el jueves y el sistema lo rechazó.',
      'Papelería San José tenía una promesa para el 5 de mayo. Pagó el 4 pero el pago no se registró correctamente. Apareció bloqueada el 7. Se corrigió el pago y se desbloqueó.',
    ],
    soluciones: [
      'Registrar el pago pendiente lo antes posible.',
      'Verificar si el pago ya se hizo pero no se registró (error de digitación).',
      'Si el cliente tiene dificultades, negociar una nueva promesa de pago con fecha realista.',
      'Una vez registrado el pago, el cliente se desbloquea automáticamente.',
    ],
    acciones: [
      { label: 'Registrar pago', accion: 'registrar_pago', variant: 'primary' },
      { label: 'Ver facturas vencidas', accion: 'ver_facturas', variant: 'secondary' },
    ],
  },
  'DISPUTA_ABIERTA': {
    tipo: 'DISPUTA_ABIERTA',
    nombre: 'Disputa abierta',
    severidad: 'ALTA',
    icono: '🔴',
    definicion:
      'Existe una reclamación del cliente que no ha sido resuelta. El cliente disputa la entrega (producto faltante, calidad, cantidad) y el caso está pendiente de investigación.',
    comoSeAplica:
      'Se revisa el campo disputaAbierta en los pedidos del cliente. Si es true y no hay registro de resolución, se dispara la alerta.',
    ejemplos: [
      'Tienda La Esquina reclama que le faltaron 2 pacas de agua en el pedido #8. El repartidor dice que entregó todo. La foto de entrega no es clara. Lleva 5 días sin resolver.',
      'Bar El Centro disputó que las pacas de hielo llegaron derretidas. El embarque salió tarde y el GPS muestra que el repartidor hizo una parada de 45 min. Se le dio nota de crédito.',
    ],
    soluciones: [
      'Revisar la foto de entrega si existe.',
      'Entrevistar al repartidor y verificar su ruta GPS ese día.',
      'Llamar al cliente para escuchar su versión y buscar acuerdo (nota de crédito, reenvío).',
      'Cerrar la disputa registrando la resolución para que desaparezca la alerta.',
    ],
    acciones: [
      { label: 'Resolver disputa', accion: 'resolver_disputa', variant: 'primary' },
      { label: 'Ver foto de entrega', accion: 'ver_foto', variant: 'secondary' },
    ],
  },
  'RECLAMACIONES_MULTIPLES': {
    tipo: 'RECLAMACIONES_MULTIPLES',
    nombre: 'Cliente conflictivo',
    severidad: 'ALTA',
    icono: '🔴',
    definicion:
      'El cliente acumula 3 o más reclamaciones (disputas) en su historial. Patrón de cliente problemático o posible fraude recurrente con las entregas.',
    comoSeAplica:
      'Se lee el campo reclamaciones del cliente. Si es >=3, se dispara.',
    ejemplos: [
      'Bar El Centro ha reclamado 4 veces en 2 meses. Siempre dice que le faltó producto. El patrón indica posible fraude: pide, reclama, obtiene nota de crédito, vuelve a pedir.',
      'Tienda La Esquina tiene 3 reclamaciones pero todas fueron por roturas reales en ruta de tierra. No es fraude, pero amerita embalar mejor sus pedidos.',
    ],
    soluciones: [
      'Revisar el historial de cada reclamación: ¿hay patrón (mismo repartidor, mismo producto, mismo día de semana)?',
      'Para próximos pedidos, exigir foto de entrega clara con todos los productos visibles.',
      'Considerar no fiarle más hasta que baje el conteo de reclamaciones.',
      'Si el patrón es claramente fraudulento, bloquear al cliente permanentemente.',
    ],
    acciones: [
      { label: 'Ver reclamaciones', accion: 'ver_reclamaciones', variant: 'primary' },
      { label: 'Bloquear fiados', accion: 'bloquear_fiados', variant: 'danger' },
    ],
  },
  'RECLAMACION_ACTIVA': {
    tipo: 'RECLAMACION_ACTIVA',
    nombre: 'Reclamación activa',
    severidad: 'MEDIA',
    icono: '🟡',
    definicion:
      'El cliente tiene al menos 1 reclamación previa. No es crítico pero amerita precaución antes de fiarle o entregar sin verificación.',
    comoSeAplica:
      'Se lee el campo reclamaciones del cliente. Si es > 0 pero < 3, se dispara esta alerta (la otra es para >=3).',
    ejemplos: [
      'Papelería San José reclamó 1 vez hace 2 meses por una paca rota. Fue legítimo. Desde entonces no ha vuelto a reclamar.',
      'Tienda La Esquina tiene 1 reclamación abierta de hace 1 semana. Se le fiaron 2 pedidos después sin resolver la primera. Riesgo de que la deuda crezca mientras hay disputa.',
    ],
    soluciones: [
      'Verificar que la reclamación anterior ya fue resuelta antes de fiar de nuevo.',
      'Para este cliente, siempre tomar foto de entrega.',
      'Si tiene saldo pendiente + reclamación, priorizar cobro antes de nuevo pedido.',
    ],
    acciones: [
      { label: 'Ver reclamaciones', accion: 'ver_reclamaciones', variant: 'primary' },
      { label: 'Ver pedidos recientes', accion: 'ver_pedidos', variant: 'secondary' },
    ],
  },
  'PROMESA_PROXIMA_VENCER': {
    tipo: 'PROMESA_PROXIMA_VENCER',
    nombre: 'Pago próximo a vencer',
    severidad: 'MEDIA',
    icono: '🟡',
    definicion:
      'El cliente tiene una promesa de pago que vence en 2 días o menos. Si no paga, el sistema lo bloqueará automáticamente.',
    comoSeAplica:
      'Se compara promesaPagoFecha con la fecha actual + umbral de días (default 2). Si la diferencia es <=2 días y estadoPago no es PAGADO, se dispara.',
    ejemplos: [
      'Bar El Centro prometió pagar $12.000 el viernes. Hoy es miércoles. Falta 2 días. Se le llama y confirma que pagará. Se evita el bloqueo.',
      'Papelería San José prometió pagar ayer pero no lo hizo. La alerta saltó hoy (1 día después). El cron lo bloqueará mañana si no se registra el pago.',
    ],
    soluciones: [
      'Llamar al cliente para recordarle la fecha de pago.',
      'Si no puede pagar, negociar extensión de plazo antes de que el cron bloquee.',
      'Registrar el pago inmediatamente si ya se hizo.',
      'Si el cliente no responde, preparar cobro personal o suspender crédito.',
    ],
    acciones: [
      { label: 'Llamar para cobrar', accion: 'llamar_cliente', variant: 'primary' },
      { label: 'Extender plazo', accion: 'extender_plazo', variant: 'secondary' },
    ],
  },
  'NO_ENTREGADO_REPETIDO': {
    tipo: 'NO_ENTREGADO_REPETIDO',
    nombre: 'Entregas fallidas',
    severidad: 'MEDIA',
    icono: '🟡',
    definicion:
      'El cliente tiene 2 o más pedidos marcados como NO_ENTREGADO en los últimos 30 días. Puede indicar dirección incorrecta, cliente evadiendo pago, o repartidor reportando falsamente.',
    comoSeAplica:
      'Se cuentan pedidos del cliente con estadoEntrega = NO_ENTREGADO y fecha en los últimos 30 días. Si >=2, se dispara.',
    ejemplos: [
      'Repartidor Juan marcó 2 pedidos de Tienda La Esquina como NO_ENTREGADO esta semana. El GPS muestra que nunca llegó a la dirección. Juan estaba vendiendo el producto por su cuenta.',
      'Bar El Centro aparece 2 veces NO_ENTREGADO. El dueño dice que sí estuvo abierto. La dirección en el sistema está mal escrita (Cra 10 #5-67 vs Cra 10 #5-76). Se corrigió.',
    ],
    soluciones: [
      'Verificar la dirección del cliente y actualizarla si es incorrecta.',
      'Revisar GPS del repartidor en esas entregas: ¿llegó a la dirección?',
      'Llamar al cliente para confirmar horarios de apertura.',
      'Si el repartidor es el patrón común, investigar sus embarques y devoluciones.',
    ],
    acciones: [
      { label: 'Verificar dirección', accion: 'editar_direccion', variant: 'primary' },
      { label: 'Llamar cliente', accion: 'llamar_cliente', variant: 'secondary' },
    ],
  },
  'DEVOLUCIONES_ANORMALES': {
    tipo: 'DEVOLUCIONES_ANORMALES',
    nombre: 'Devoluciones sospechosas',
    severidad: 'MEDIA',
    icono: '🟡',
    definicion:
      'Un repartidor tiene devoluciones de producto significativamente mayores a su promedio histórico. Puede estar vendiendo producto por su cuenta y reportándolo como devuelto.',
    comoSeAplica:
      'Se calcula el promedio de devoluciones (agua + hielo) por embarque de cada repartidor. Si un embarque reciente supera 2x ese promedio, se dispara.',
    ejemplos: [
      'Repartidor Juan suele devolver 1 paca por embarque. Esta semana devolvió 15 pacas en 3 embarques. Investigación: vendía pacas a una tienda vecina y reportaba como devueltas.',
      'Repartidor María tuvo 8 devoluciones un día de lluvia intensa. Los clientes no abrieron. Fue legítimo pero se le pidió confirmar entregas por WhatsApp en esos días.',
    ],
    soluciones: [
      'Revisar los embarques del repartidor con devoluciones altas uno por uno.',
      'Comparar con sus embarques anteriores: ¿es un evento aislado o patrón?',
      'Verificar GPS: ¿estuvo cerca de los clientes que no abrieron?',
      'Si hay patrón, cambiarlo de ruta temporalmente y hacer auditoría sorpresa.',
    ],
    acciones: [
      { label: 'Revisar embarques', accion: 'ver_embarques', variant: 'primary' },
      { label: 'Ver ruta GPS', accion: 'ver_gps', variant: 'secondary' },
    ],
  },
  'ROTURAS_ANORMALES': {
    tipo: 'ROTURAS_ANORMALES',
    nombre: 'Roturas sospechosas',
    severidad: 'BAJA',
    icono: '🔵',
    definicion:
      'Un repartidor reporta roturas de producto significativamente mayores a su promedio. Puede estar dañando producto intencionalmente para venderlo como dañado a precio reducido.',
    comoSeAplica:
      'Se calcula el promedio de roturas (agua + hielo) por embarque de cada repartidor. Si supera 2x el promedio, se dispara.',
    ejemplos: [
      'Repartidor Pedro reportó 5 roturas esta semana. Su promedio es 0.3. Investigación: rompía intencionalmente bolsas para venderlas a $500 en su barrio.',
      'Repartidor Ana reportó 3 roturas en un día de camino de terracería con baches grandes. Fue legítimo. Se le cambió la ruta.',
    ],
    soluciones: [
      'Revisar fotos de las roturas si existen.',
      'Verificar si las roturas ocurrieron en días con malas condiciones de ruta.',
      'Si el patrón es repetido, hacer auditoría física del vehículo del repartidor.',
      'Descontar el costo de las roturas del repartidor si hay evidencia de negligencia.',
    ],
    acciones: [
      { label: 'Revisar embarques', accion: 'ver_embarques', variant: 'primary' },
      { label: 'Ver historial repartidor', accion: 'ver_repartidor', variant: 'secondary' },
    ],
  },
  'DESCUENTO_NO_JUSTIFICADO': {
    tipo: 'DESCUENTO_NO_JUSTIFICADO',
    nombre: 'Descuento sin justificar',
    severidad: 'MEDIA',
    icono: '🟡',
    definicion:
      'Existe un descuento aplicado a un repartidor sin justificación documentada. Puede ser un descuento legítimo que nadie documentó, o un abuso del sistema de descuentos.',
    comoSeAplica:
      'Se revisa la tabla DescuentoRepartidor donde justificado = false. Si hay registros no justificados, se dispara.',
    ejemplos: [
      'Se descontó $50.000 al repartidor Juan por producto perdido. No hay foto, ni firma del cliente, ni explicación detallada. Resultó ser una venta no reportada de Juan.',
      'Descuento de $20.000 a repartidor María por roturas. María tenía fotos en su celular pero no las subió al sistema. Se justificó después con las fotos.',
    ],
    soluciones: [
      'Solicitar al responsable que suba la justificación (foto, firma, explicación).',
      'Si no hay justificación en 48h, reversar el descuento o investigar al repartidor.',
      'Revisar quién autorizó el descuento originalmente.',
      'Implementar requisito de foto obligatoria para todo descuento.',
    ],
    acciones: [
      { label: 'Solicitar justificación', accion: 'justificar_descuento', variant: 'primary' },
      { label: 'Ver detalle descuento', accion: 'ver_descuento', variant: 'secondary' },
    ],
  },
  'NOTA_CREDITO_FRECUENTE': {
    tipo: 'NOTA_CREDITO_FRECUENTE',
    nombre: 'Notas de crédito frecuentes',
    severidad: 'ALTA',
    icono: '🔴',
    definicion:
      'El cliente ha generado 2 o más notas de crédito en los últimos 30 días. Patrón de cancelaciones/devoluciones recurrentes que puede indicar inestabilidad o fraude con facturas.',
    comoSeAplica:
      'Se cuentan las notas de crédito asociadas a pedidos del cliente en los últimos 30 días. Si >=2, se dispara.',
    ejemplos: [
      'Bar El Centro tuvo 3 notas de crédito este mes: 1 por cancelación, 2 por producto devuelto. El patrón indica que pide, factura, y luego devuelve para quedar con factura limpia pero producto gratis.',
      'Tienda La Esquina tuvo 2 notas de crédito por roturas reales en ruta de tierra. Legítimo, pero se mejoró el embalaje.',
    ],
    soluciones: [
      'Revisar el motivo de cada nota de crédito.',
      'Si hay patrón de cancelaciones, exigir pago anticipado para futuros pedidos.',
      'Verificar si el cliente revende el producto y luego lo devuelve.',
      'Si es claramente fraudulento, bloquear al cliente y revisar pedidos con el mismo repartidor.',
    ],
    acciones: [
      { label: 'Ver notas de crédito', accion: 'ver_notas_credito', variant: 'primary' },
      { label: 'Revisar pedidos', accion: 'ver_pedidos', variant: 'secondary' },
    ],
  },
  'PRECIO_POR_DEBAJO_TABLA': {
    tipo: 'PRECIO_POR_DEBAJO_TABLA',
    nombre: 'Precio por debajo de tabla',
    severidad: 'ALTA',
    icono: '🔴',
    definicion:
      'El precio aplicado en un pedido es menor al mínimo establecido en la tabla de precios para ese canal y cantidad. Puede ser error de digitación, descuento no autorizado, o venta paralela del repartidor.',
    comoSeAplica:
      'Se compara PedidoItem.precio con el PrecioVolumen mínimo para ese producto, canal y rango de cantidad. Si es menor, se dispara.',
    ejemplos: [
      'Repartidor Juan vendió pacas de agua a $2.000 cuando la tabla mínima es $2.300. La diferencia de $300 x 20 pacas = $6.000 no registrados. Juan cobraba el precio correcto y se quedaba con la diferencia.',
      'Asistente María digitó $2.000 en vez de $3.000 para botellones. Error humano. Se corrigió antes de facturar gracias a la alerta.',
    ],
    soluciones: [
      'Revisar el pedido item por item para identificar qué producto está por debajo.',
      'Verificar quién creó/actualizó el pedido.',
      'Si es repartidor, revisar si cobró el precio correcto al cliente y se quedó con la diferencia.',
      'Corregir el precio antes de facturar o registrar como descuento autorizado con justificación.',
    ],
    acciones: [
      { label: 'Revisar precios', accion: 'ver_precios', variant: 'primary' },
      { label: 'Ver tabla de precios', accion: 'ver_tabla_precios', variant: 'secondary' },
    ],
  },
  'REPARTIDOR_DEUDA_ALTA': {
    tipo: 'REPARTIDOR_DEUDA_ALTA',
    nombre: 'Deuda de repartidor alta',
    severidad: 'MEDIA',
    icono: '🟡',
    definicion:
      'Un repartidor acumula deuda de reposiciones (producto que debe devolver o pagar) superior al umbral configurado. Puede estar vendiendo producto no entregado.',
    comoSeAplica:
      'Se lee Trabajador.deudaReposAgua + deudaReposHielo. Si la suma supera el umbral (ej: 50 pacas o $500.000), se dispara.',
    ejemplos: [
      'Repartidor Pedro debe 45 pacas de agua y 20 de hielo. Nunca las repone. Investigación: vendía el producto sobrante a una tienda vecina y reportaba devoluciones.',
      'Repartidor Ana debe 30 pacas por roturas legítimas en 3 meses. Tiene plan de pago. No es fraude pero se monitorea.',
    ],
    soluciones: [
      'Revisar el historial de deuda del repartidor: ¿crece constantemente o tiene picos?',
      'Exigir plan de reposición con fechas concretas.',
      'Si la deuda sigue creciendo, suspenderlo de rutas y hacer auditoría completa.',
      'Descontar la deuda de su nómina si hay acuerdo firmado.',
    ],
    acciones: [
      { label: 'Registrar reposición', accion: 'registrar_reposicion', variant: 'primary' },
      { label: 'Ver historial', accion: 'ver_repartidor', variant: 'secondary' },
    ],
  },
  'CLIENTE_NO_VERIFICADO': {
    tipo: 'CLIENTE_NO_VERIFICADO',
    nombre: 'Cliente no verificado',
    severidad: 'MEDIA',
    icono: '🟡',
    definicion:
      'El cliente fue creado hace más de 30 días y aún no ha sido verificado. Los clientes no verificados creados por repartidores no pueden fiar.',
    comoSeAplica:
      'El cron diario revisa clientes con verificado = false y createdAt > 30 días. También se dispara en tiempo real al abrir el detalle del cliente.',
    ejemplos: [
      'Bar El Centro fue creado por repartidor Juan hace 45 días. Nunca se verificó. Juan le ha estado fiando ilegalmente. Se bloqueó fiado y se pidió verificación con cédula y fotos del local.',
      'Tienda La Esquina fue creada por asistente María hace 60 días. María se fue de vacaciones y nadie verificó. Era un cliente real, solo faltaba el trámite administrativo.',
    ],
    soluciones: [
      'Llamar al cliente para confirmar datos y pedir foto del negocio.',
      'Visitar el local para verificar que existe.',
      'Si es creado por repartidor, verificar que no sea un cliente fantasma.',
      'Marcar como verificado en el sistema una vez confirmado.',
    ],
    acciones: [
      { label: 'Verificar cliente', accion: 'verificar_cliente', variant: 'primary' },
      { label: 'Llamar cliente', accion: 'llamar_cliente', variant: 'secondary' },
    ],
  },
  'MULTIPLES_PEDIDOS_RAPIDO': {
    tipo: 'MULTIPLES_PEDIDOS_RAPIDO',
    nombre: 'Pedidos muy seguidos',
    severidad: 'MEDIA',
    icono: '🟡',
    definicion:
      'El cliente realizó 2 o más pedidos con menos de 1 hora de diferencia. Puede ser error de doble clic, repartidor creando pedidos fantasmas, o urgencia real.',
    comoSeAplica:
      'Se ordenan los pedidos del día por hora. Si hay 2 consecutivos con diferencia < 60 minutos, se dispara.',
    ejemplos: [
      'Repartidor Juan creó 2 pedidos para Bar El Centro a las 9:00am y 9:15am. El cliente solo pidió 1 vez. Juan duplicó para cobrar doble comisión.',
      'Tienda La Esquina pidió a las 2:00pm y 2:30pm. Primero pidió agua, luego se dio cuenta que también necesitaba hielo y pidió de nuevo. Fue legítimo.',
    ],
    soluciones: [
      'Revisar si los pedidos tienen productos distintos (puede ser complementario).',
      'Verificar quién creó cada pedido y desde qué dispositivo.',
      'Llamar al cliente si ambos pedidos tienen productos similares.',
      'Si es repartidor, revisar sus embarques de ese día.',
    ],
    acciones: [
      { label: 'Ver pedidos', accion: 'ver_pedidos_hoy', variant: 'primary' },
      { label: 'Ver historial cliente', accion: 'ver_cliente', variant: 'secondary' },
    ],
  },
  'CAMBIO_PRECIO_BRUSCO': {
    tipo: 'CAMBIO_PRECIO_BRUSCO',
    nombre: 'Cambio de precio brusco',
    severidad: 'ALTA',
    icono: '🔴',
    definicion:
      'El precio de un producto en este pedido varía más del 30% respecto al último pedido del mismo cliente. Detecta errores de precio o cambios no autorizados.',
    comoSeAplica:
      'Se compara el precio unitario de cada producto en el pedido actual vs el último pedido entregado del cliente. Si la variación es >30% (arriba o abajo), se dispara.',
    ejemplos: [
      'Tienda La Esquina pagaba $2.300 por paca de agua. Hoy el pedido muestra $3.500 (+52%). El repartidor cobró precio de domicilio en lugar de punto. Se corrigió.',
      'Bar El Centro pagaba $10.000 por botellón domicilio. Hoy aparece $5.000 (-50%). El repartidor aplicó precio de fábrica por error. Perdida de $5.000 si no se corrige.',
    ],
    soluciones: [
      'Verificar qué precio debería aplicar según canal y cantidad (tabla de precios).',
      'Revisar si el cliente cambió de canal (DOMICILIO → PUNTO o viceversa).',
      'Si es repartidor, confirmar con él por qué cambió el precio.',
      'Corregir el precio antes de entregar o registrar la razón del cambio.',
    ],
    acciones: [
      { label: 'Revisar precios', accion: 'ver_precios', variant: 'primary' },
      { label: 'Ver tabla precios', accion: 'ver_tabla_precios', variant: 'secondary' },
    ],
  },
}

export const REGLAS_ALERTAS = Object.values(GUIA_ALERTAS).map((g) => ({
  tipo: g.tipo,
  label: g.nombre,
  desc: g.definicion.split('.')[0] + '.',
  severidad: g.severidad,
}))

export function getGuiaAlerta(tipo: AlertaTipo): GuiaAlerta {
  return GUIA_ALERTAS[tipo]
}

export function getBadgeColor(severidad: SeveridadAlerta): string {
  switch (severidad) {
    case 'ALTA':
      return 'bg-red-100 text-red-700 border-red-200'
    case 'MEDIA':
      return 'bg-amber-100 text-amber-700 border-amber-200'
    default:
      return 'bg-blue-100 text-blue-700 border-blue-200'
  }
}

export function getBadgeDot(severidad: SeveridadAlerta): string {
  switch (severidad) {
    case 'ALTA':
      return 'bg-red-500'
    case 'MEDIA':
      return 'bg-amber-500'
    default:
      return 'bg-blue-500'
  }
}

export function getSeveridadOrder(severidad: SeveridadAlerta): number {
  return { ALTA: 3, MEDIA: 2, BAJA: 1 }[severidad]
}

// localStorage key para alertas ignoradas
function getIgnoradaKey(clienteId: string, tipo: AlertaTipo): string {
  return `alerta_ignorada_${clienteId}_${tipo}`
}

export function estaIgnorada(clienteId: string, tipo: AlertaTipo): boolean {
  if (typeof window === 'undefined') return false
  const raw = localStorage.getItem(getIgnoradaKey(clienteId, tipo))
  if (!raw) return false
  const ts = parseInt(raw, 10)
  // 24h = 86400000ms
  return Date.now() - ts < 86400000
}

export function ignorarAlerta(clienteId: string, tipo: AlertaTipo): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(getIgnoradaKey(clienteId, tipo), Date.now().toString())
}

export function limpiarIgnoradas(): void {
  if (typeof window === 'undefined') return
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith('alerta_ignorada_')) keys.push(k)
  }
  keys.forEach((k) => localStorage.removeItem(k))
}
