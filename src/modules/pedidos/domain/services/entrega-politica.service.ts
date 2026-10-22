/**
 * Política de entrega — funciones PURAS que deciden, con UNA sola regla,
 * (a) en qué estado de entrega nace un pedido y (b) si ese estado obliga a
 * tener información de entrega suficiente (`resolverEntrega`).
 *
 * Existe porque Preview y Crear calculaban el estado por separado y
 * divergían (Preview ignoraba el `origen`; Crear no). Ambos, y
 * ActualizarPedido, usan ESTAS funciones: el preview no puede aprobar lo que
 * el commit va a rechazar, ni al revés.
 *
 * El carácter anónimo del cliente (CONSUMIDOR_FINAL) NO es una excepción: lo
 * que exime a una operación es que NO deje mercancía pendiente de llevar.
 */

export type OrigenCreacion = 'PEDIDO' | 'VENTA_RAPIDA' | 'RECURRENTE' | 'VENTA_LIBRE' | string

/**
 * Estado de entrega con el que nace un pedido.
 *
 * - `entregado === false` → entrega posterior (ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001): PENDIENTE.
 * - Venta rápida (`origen = VENTA_RAPIDA`, sin cliente real) → ENTREGADO.
 * - Venta de PUNTO con `entregado === true` EXPLÍCITO → ENTREGADO, tenga o no
 *   cliente real: es la venta del mostrador pagada en el momento (modal
 *   "Venta Rápida" → Punto de Venta). Sin ese `true` explícito un pedido de
 *   PUNTO sigue naciendo PENDIENTE ("para recoger"). Nunca aplica a DOMICILIO,
 *   que necesita logística.
 * - Cualquier otro caso → PENDIENTE.
 */
export function estadoEntregaAlCrear(input: {
  origen: OrigenCreacion
  canal?: 'PUNTO' | 'DOMICILIO' | string | null
  entregado?: boolean | null
}): 'ENTREGADO' | 'PENDIENTE' {
  if (input.entregado === false) return 'PENDIENTE'
  if (input.origen === 'VENTA_RAPIDA') return 'ENTREGADO'
  if (input.canal === 'PUNTO' && input.entregado === true) return 'ENTREGADO'
  return 'PENDIENTE'
}

const ESTADOS_PENDIENTES = new Set(['PENDIENTE', 'EN_RUTA', 'NO_ENTREGADO'])

/** ¿Queda mercancía por llevar al cliente? */
export function dejaEntregaPendiente(estadoEntrega: string): boolean {
  return ESTADOS_PENDIENTES.has(estadoEntrega)
}

/**
 * ¿Debe validarse la suficiencia de la información de entrega?
 *
 * - Un pedido DOMICILIO que deja mercancía pendiente (PUNTO es retiro en
 *   mostrador; un pedido ya entregado o cerrado no necesita un destino futuro).
 * - Decisión del PO (2026-10-22, P1-2 / B-10): una VENTA RÁPIDA a DOMICILIO
 *   exige destino aunque ya esté entregada. El destino es el registro de la
 *   venta: sin él, queda una venta a domicilio que nadie sabe adónde fue.
 *   Aplica a la creación y a la edición del destino, no a otros orígenes.
 */
export function requiereEntregaSuficiente(input: {
  canal: 'PUNTO' | 'DOMICILIO' | string
  estadoEntrega: string
  origen?: OrigenCreacion | null
}): boolean {
  if (input.canal !== 'DOMICILIO') return false
  if (input.origen === 'VENTA_RAPIDA') return true
  return dejaEntregaPendiente(input.estadoEntrega)
}

/**
 * Ubicación de destino propia del pedido (`entregaLat/entregaLng`). Devuelve
 * `null` si falta alguna de las dos o no es utilizable: finitas, dentro de
 * rango geográfico y distintas de (0,0) (Golfo de Guinea, el valor que
 * produce `Number(null)`). Autoridad única para persistir y para evaluar la
 * suficiencia: nunca se guarda un destino que `resolverEntrega` rechazaría.
 */
export function ubicacionEntregaValida(
  lat: unknown,
  lng: unknown,
): { lat: number; lng: number } | null {
  if (lat == null || lng == null) return null
  const la = Number(lat)
  const ln = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null
  if (la === 0 && ln === 0) return null
  return { lat: la, lng: ln }
}

/** Destino efectivo de un pedido: texto resuelto + ubicación propia. */
export interface DestinoEfectivo {
  direccion: string
  barrio: string
  lat: number | null
  lng: number | null
}

const norm = (v: string | null | undefined): string => (v ?? '').trim()
// Decimal(10,6): dos coords que difieren por menos de 1e-6 son la misma.
const mismaCoord = (a: number | null, b: number | null): boolean =>
  a === b || (a != null && b != null && Math.abs(a - b) < 1e-6)

/**
 * ¿Cambia el destino efectivo? Autoridad única para decidir si una edición
 * debe revalidar la suficiencia (D2): una observación, un cambio de
 * cantidades o reenviar los mismos valores NO cambia el destino y no puede
 * bloquearse por una insuficiencia histórica.
 */
export function destinoEfectivoCambia(actual: DestinoEfectivo, nuevo: DestinoEfectivo): boolean {
  return (
    norm(actual.direccion) !== norm(nuevo.direccion) ||
    norm(actual.barrio) !== norm(nuevo.barrio) ||
    !mismaCoord(actual.lat, nuevo.lat) ||
    !mismaCoord(actual.lng, nuevo.lng)
  )
}
