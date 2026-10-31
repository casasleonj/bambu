/**
 * Reducción comercial aceptada (#451, ADR-REDUCCION-COMERCIAL-001).
 *
 * «El cliente pidió 20, recibió 15 y ya no quiere las 5 restantes.» Baja la cantidad
 * PEDIDA de una línea por acuerdo comercial; no es un error de captura (eso es
 * `AjustarPedidoCantidadUseCase`/G11) ni toca lo ya entregado.
 *
 * Lógica pura (sin Prisma). Toda la aritmética va en centavos enteros: el total, el
 * saldo, la factura y la nota de crédito salen de los mismos números.
 *
 * Reglas:
 * - La línea conserva su precio unitario: `monto = cantidadReducida × precio`. Si el
 *   precio por volumen debe cambiar, se hace después con la corrección de precio.
 * - No se puede dejar `cantPedido` por debajo de `cantEntrega` (lo entregado es historia).
 * - Si el nuevo total quedaría por debajo de lo ya pagado se RECHAZA
 *   (`REDUCCION_GENERARIA_SOBREPAGO`): `chk_pedido_montopagado_le_total` y
 *   `totalPagado = Σ Pago + Σ Abono` no permiten bajar el total sin reversar pagos.
 * - Un pedido no puede quedar sin ninguna unidad: eso es cancelarlo/anularlo.
 * - Quién autoriza: permiso explícito por usuario (`puedeAutorizarReduccionComercial`)
 *   sobre un rol que ve pedidos. Ser ADMIN no basta.
 */

export const MEDIOS_CONSENTIMIENTO = ['PRESENCIAL', 'TELEFONO', 'MENSAJE'] as const
export type MedioConsentimiento = (typeof MEDIOS_CONSENTIMIENTO)[number]

const aCentavos = (n: number): number => Math.round((n + Number.EPSILON) * 100)
const deCentavos = (c: number): number => c / 100

export interface ReduccionInput {
  total: number
  totalPagado: number
  cantPedido: number
  cantEntrega: number
  precio: number
  cantidadReducida: number
  /** Unidades pedidas en las demás líneas del pedido. */
  unidadesOtrasLineas: number
}

export interface ReduccionResultado {
  monto: number
  cantPedidoNueva: number
  totalNuevo: number
  saldoNuevo: number
}

export function calcularReduccion(input: ReduccionInput): ReduccionResultado {
  const { cantPedido, cantEntrega, cantidadReducida } = input
  if (!Number.isInteger(cantidadReducida) || cantidadReducida <= 0) {
    throw new Error('CANTIDAD_INVALIDA: la cantidad que deja de pedirse debe ser un entero mayor que 0.')
  }
  if (!Number.isFinite(input.precio) || input.precio <= 0) {
    throw new Error('PRECIO_INVALIDO: la línea no tiene un precio válido.')
  }
  const cantPedidoNueva = cantPedido - cantidadReducida
  if (cantPedidoNueva < cantEntrega) {
    throw new Error(
      `REDUCCION_SOBRE_ENTREGADO: solo se pueden quitar ${Math.max(0, cantPedido - cantEntrega)} unidades; ` +
        `las ${cantEntrega} entregadas no se tocan.`,
    )
  }
  if (cantPedidoNueva + input.unidadesOtrasLineas <= 0) {
    throw new Error('REDUCCION_TOTAL: el pedido se quedaría sin unidades. Para eso se cancela o se anula el pedido.')
  }
  const montoC = aCentavos(input.precio) * cantidadReducida
  const totalNuevoC = aCentavos(input.total) - montoC
  const pagadoC = aCentavos(input.totalPagado)
  if (totalNuevoC < pagadoC) {
    throw new Error(
      `REDUCCION_GENERARIA_SOBREPAGO: con la reducción el pedido costaría ${deCentavos(totalNuevoC)} y el cliente ya pagó ${deCentavos(pagadoC)}. ` +
        'Reversa primero el pago que sobra.',
    )
  }
  return {
    monto: deCentavos(montoC),
    cantPedidoNueva,
    totalNuevo: deCentavos(totalNuevoC),
    saldoNuevo: deCentavos(totalNuevoC - pagadoC),
  }
}

/** Quién puede registrar una reducción (cualquiera que vea pedidos de oficina). */
export function puedeSolicitarReduccion(rol: string): boolean {
  return rol === 'ADMIN' || rol === 'ASISTENTE'
}

/**
 * Quién puede aplicar (autorizar o rechazar): permiso explícito por usuario, sobre un
 * usuario activo con rol de oficina. El rol por sí solo no alcanza.
 */
export function puedeAutorizarReduccion(u: { rol: string; activo: boolean; puedeAutorizarReduccionComercial: boolean }): boolean {
  return u.activo && u.puedeAutorizarReduccionComercial && puedeSolicitarReduccion(u.rol)
}

/** Si quien registra ya puede autorizar, se aplica en el acto; si no, queda PENDIENTE. */
export function decidirAplicacionReduccion(u: { rol: string; activo: boolean; puedeAutorizarReduccionComercial: boolean }): 'APLICAR' | 'SOLICITAR' {
  return puedeAutorizarReduccion(u) ? 'APLICAR' : 'SOLICITAR'
}

export function pedidoReducible(estadoEntrega: string, estado: string): boolean {
  const cerrado = new Set(['CANCELADO', 'ANULADO'])
  return !cerrado.has(estadoEntrega) && !cerrado.has(estado)
}

/**
 * Reparte la reducción de botellones entre «fábrica» y «domicilio» sin tocar lo entregado:
 * quita primero de lo pendiente a domicilio y luego de lo pendiente en fábrica.
 */
export function repartirReduccionBotellon(
  p: { fabPed: number; fabEnt: number; domPed: number; domEnt: number },
  reducir: number,
): { fabPed: number; domPed: number } {
  const pendDom = Math.max(0, p.domPed - p.domEnt)
  const pendFab = Math.max(0, p.fabPed - p.fabEnt)
  if (reducir > pendDom + pendFab) {
    throw new Error('REDUCCION_SOBRE_ENTREGADO: la reducción de botellones supera lo pendiente.')
  }
  const quitaDom = Math.min(reducir, pendDom)
  const quitaFab = reducir - quitaDom
  return { fabPed: p.fabPed - quitaFab, domPed: p.domPed - quitaDom }
}
