/**
 * Quién entregó un pedido — decisión que la pantalla toma SIN preguntar cuando se
 * puede (PR-1B, decisión del PO 2026-10-22). Función pura para probarla sin UI.
 *
 *  - sin embarque (mostrador / sin ruta)     → entrega normal, sin salida del vehículo;
 *  - embarque ABIERTO (aún no sale)          → el vehículo no pudo entregar: es un retiro;
 *  - embarque EN_RUTA + "Entregó el repartidor" → salida del vehículo (embarqueEntregaId);
 *  - embarque EN_RUTA + "Cliente retiró"        → retiro: se suelta del embarque.
 */
export type QuienEntrego = 'REPARTIDOR' | 'CLIENTE_RETIRO'

export interface ResolucionEntrega {
  /** Marcar entregado y soltar el pedido del embarque (sin salida física). */
  clienteRetiro: boolean
  /** Embarque cuyo vehículo entregó (solo si ya salió). */
  embarqueEntregaId?: string
  /** ¿Tiene sentido tomar el GPS? Solo si lo entregó un vehículo / no es un retiro. */
  tomarGps: boolean
}

export function resolverEntrega(input: {
  embarqueId?: string | null
  embarqueEstado?: string | null
  quien: QuienEntrego
}): ResolucionEntrega {
  const { embarqueId, embarqueEstado, quien } = input
  const retiro = quien === 'CLIENTE_RETIRO' || embarqueEstado === 'ABIERTO'
  return {
    clienteRetiro: retiro && Boolean(embarqueId),
    embarqueEntregaId: !retiro && embarqueId && embarqueEstado === 'EN_RUTA' ? embarqueId : undefined,
    tomarGps: !retiro,
  }
}
