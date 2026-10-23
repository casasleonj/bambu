/**
 * Cobro en la puerta (repartidor) — regla pura, sin UI (issue #318).
 *
 * El estado de pago NO se elige: el servidor lo deduce de lo cobrado contra lo que
 * se debe. Esta función solo anticipa ese resultado para mostrárselo al repartidor
 * antes de confirmar y decide si lo cobrado deja una deuda que él puede dejar:
 *
 *  - cobra todo           → PAGADO;
 *  - cobra algo           → PARCIAL (el resto queda como deuda);
 *  - no cobra nada        → FIADO (todo queda como deuda).
 *
 * Antifraude (decisión del PO, opción A): el repartidor NO crea crédito por su
 * cuenta. Dejar deuda solo es posible si la oficina ya la había aceptado (el
 * pedido trae `promesaPagoFecha`) y el cliente es un deudor real (no la venta
 * anónima). En cualquier otro caso no entrega: el pedido vuelve en el embarque.
 * El servidor aplica la misma regla (`FIADO_NO_AUTORIZADO`); esto es solo la
 * anticipación para la pantalla.
 */
export type EstadoCobro = 'PAGADO' | 'PARCIAL' | 'FIADO'

export interface CobroEntregaInput {
  /** Lo que el cliente debe por lo que se entrega ahora (saldo del pedido). */
  saldo: number
  /** Lo que el repartidor dice haber cobrado. */
  monto: number
  /** La oficina aceptó de antemano que este pedido quede a deber. */
  deudaAceptada: boolean
  /** Venta anónima (CONSUMIDOR_FINAL): la deuda no puede quedar a cargo de nadie. */
  esAnonimo: boolean
}

export interface CobroEntregaResultado {
  /** Monto saneado: nunca negativo ni mayor que el saldo. */
  montoAplicado: number
  /** Lo que queda por cobrar tras este cobro. */
  restante: number
  estado: EstadoCobro
  /** ¿Puede confirmarse la entrega con este cobro? */
  permitido: boolean
  motivoBloqueo?: 'VENTA_ANONIMA' | 'FIADO_NO_AUTORIZADO'
  /** Frase corta para la pantalla; el monto restante lo compone la UI con formato de moneda. */
  mensaje: string
}

const centavos = (n: number) => Math.round(n * 100)

export function calcularCobroEntrega(input: CobroEntregaInput): CobroEntregaResultado {
  const saldoC = Math.max(0, centavos(input.saldo))
  const pedidoC = Number.isFinite(input.monto) ? centavos(input.monto) : 0
  const aplicadoC = Math.min(Math.max(0, pedidoC), saldoC)
  const restanteC = saldoC - aplicadoC
  const montoAplicado = aplicadoC / 100
  const restante = restanteC / 100

  if (restanteC === 0) {
    return { montoAplicado, restante, estado: 'PAGADO', permitido: true, mensaje: 'Queda pagado.' }
  }

  const estado: EstadoCobro = aplicadoC > 0 ? 'PARCIAL' : 'FIADO'
  const etiqueta = estado === 'PARCIAL' ? 'parcial' : 'fiado'

  if (input.esAnonimo) {
    return {
      montoAplicado, restante, estado, permitido: false, motivoBloqueo: 'VENTA_ANONIMA',
      mensaje: 'Una venta sin cliente registrado debe pagarse completa.',
    }
  }
  if (!input.deudaAceptada) {
    return {
      montoAplicado, restante, estado, permitido: false, motivoBloqueo: 'FIADO_NO_AUTORIZADO',
      mensaje: 'La oficina no autorizó dejar esta deuda. No lo entregues: se devuelve al cerrar el embarque.',
    }
  }
  return { montoAplicado, restante, estado, permitido: true, mensaje: `Quedará ${etiqueta}.` }
}
