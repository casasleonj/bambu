/**
 * #930 — Adaptador PURO a Google Route Optimization API.
 * NO geodesia: tiempos y orden se calculan mediante carreteras por el proveedor.
 * Solo devuelve IDs ordenados, nunca un mapa. Ninguna función llama a Google.
 *
 * Referencia: https://developers.google.com/maps/documentation/route-optimization/reference/rest/v1/projects.locations/optimizeTours
 */
export type TipoGestionVial = 'ENTREGA' | 'COBRO' | 'ENTREGA_Y_COBRO'

export interface CoordenadaVial {
  lat: number
  lng: number
}
export interface ParadaVial extends CoordenadaVial {
  pedidoId: string
  tipo: TipoGestionVial
}
export interface SolicitudRecorridoVial {
  origen: CoordenadaVial
  paradas: readonly ParadaVial[]
  salida: Date
}

export class RecorridoVialError extends Error {
  constructor(
    public readonly codigo: 'COORDENADAS_INVALIDAS' | 'PARADAS_INVALIDAS' | 'RUTA_INCOMPLETA' | 'RESPUESTA_INVALIDA' | 'SIN_RUTA',
    message: string,
  ) {
    super(message)
    this.name = 'RecorridoVialError'
  }
}

export function coordenadaVialValida(c: CoordenadaVial): boolean {
  return Number.isFinite(c.lat) && Number.isFinite(c.lng) &&
    Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180 &&
    !(c.lat === 0 && c.lng === 0)
}

const latLng = ({ lat, lng }: CoordenadaVial) => ({
  latitude: lat,
  longitude: lng,
})

/**
 * SingleVehicleRouting. Ruta abierta: omite endLocation/endWaypoint
 * para terminar en la última parada; NO fuerza regreso a fábrica.
 * Se usa DRIVING como aproximación provisional, NO certificación de
 * transitabilidad de una motocarga de tres ruedas.
 *
 * No se inventan duración de descarga ni ventanas duras.
 * El coste unitario de viaje favorece minimizar horas de circulación.
 */
export function construirSolicitudGoogle(input: SolicitudRecorridoVial) {
  if (!coordenadaVialValida(input.origen))
    throw new RecorridoVialError('COORDENADAS_INVALIDAS', 'El origen no tiene una ubicación válida.')
  if (input.paradas.length === 0 || input.paradas.length > 25)
    throw new RecorridoVialError('PARADAS_INVALIDAS', 'Selecciona entre 1 y 25 paradas para esta salida.')
  if (!Number.isFinite(input.salida.getTime()))
    throw new RecorridoVialError('PARADAS_INVALIDAS', 'La fecha de salida no es válida.')

  const ids = new Set<string>()
  for (const p of input.paradas) {
    if (!coordenadaVialValida(p))
      throw new RecorridoVialError('COORDENADAS_INVALIDAS', 'Hay una parada sin coordenadas válidas.')
    if (!p.pedidoId || p.pedidoId.length > 128 || ids.has(p.pedidoId))
      throw new RecorridoVialError('PARADAS_INVALIDAS', 'Hay pedidos repetidos o identificadores no válidos.')
    ids.add(p.pedidoId)
  }

  const inicio = input.salida.toISOString()
  const fin = new Date(input.salida.getTime() + 12 * 60 * 60 * 1000).toISOString()
  return {
    timeout: '5s',
    searchMode: 'RETURN_FAST',
    considerRoadTraffic: true,
    useGeodesicDistances: false,
    populatePolylines: false,
    populateTransitionPolylines: false,
    model: {
      globalStartTime: inicio,
      globalEndTime: fin,
      vehicles: [{
        label: 'motocarga-unica',
        travelMode: 'DRIVING',
        startLocation: latLng(input.origen),
        startTimeWindows: [{ startTime: inicio, endTime: inicio }],
        costPerTraveledHour: 1,
      }],
      shipments: input.paradas.map((p) => ({
        label: p.pedidoId,
        deliveries: [{ arrivalLocation: latLng(p) }],
      })),
    },
  } as const
}

export interface ResultadoRecorridoVial {
  ordenPedidoIds: string[]
  totalParadas: number
  proveedor: 'GOOGLE_ROUTE_OPTIMIZATION'
  modoVial: 'DRIVING'
}

type Objeto = Record<string, unknown>
function objeto(v: unknown): Objeto | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Objeto : null
}

/**
 * Los proto3 REST omiten a veces valores por defecto (shipmentIndex=0).
 * Aceptamos omisión del índice 0 sin inventar visitas, pero rechazamos
 * índices ajenos, repetidos, paradas saltadas o respuestas inconsistentes.
 */
export function leerOrdenGoogle(resp: unknown, paradas: readonly ParadaVial[]): ResultadoRecorridoVial {
  const raiz = objeto(resp)
  if (!raiz || !Array.isArray(raiz.routes) || !Array.isArray(raiz.skippedShipments ?? []))
    throw new RecorridoVialError('RESPUESTA_INVALIDA', 'Google devolvió una respuesta incompleta.')
  if (raiz.skippedShipments && (raiz.skippedShipments as unknown[]).length)
    throw new RecorridoVialError('RUTA_INCOMPLETA', 'Hay visitas que Google no pudo incorporar al recorrido.')
  if (raiz.routes.length !== 1)
    throw new RecorridoVialError('SIN_RUTA', 'No se obtuvo una única ruta vial para esta salida.')
  const ruta = objeto(raiz.routes[0])
  if (!ruta || !Array.isArray(ruta.visits))
    throw new RecorridoVialError('RESPUESTA_INVALIDA', 'No se obtuvo el orden de visitas.')
  const porId = new Map(paradas.map((p, i) => [p.pedidoId, i]))
  if (ruta.visits.length !== paradas.length)
    throw new RecorridoVialError('RUTA_INCOMPLETA', 'La ruta omite o duplica paradas seleccionadas.')
  const ordenPedidoIds: string[] = []
  const usados = new Set<number>()
  for (const v of ruta.visits) {
    const visita = objeto(v)
    if (!visita || visita.isPickup === true ||
      (visita.visitType != null && visita.visitType !== 'DELIVER_SHIPMENT'))
      throw new RecorridoVialError('RESPUESTA_INVALIDA', 'El recorrido tiene una visita desconocida.')
    let indice: number
    if (typeof visita.shipmentIndex === 'number' && Number.isSafeInteger(visita.shipmentIndex))
      indice = visita.shipmentIndex
    else if (visita.shipmentIndex == null)
      indice = 0 // proto3 omite el índice 0, también cuando es primer elemento
    else
      throw new RecorridoVialError('RESPUESTA_INVALIDA', 'El índice de parada no es válido.')
    if (indice < 0 || indice >= paradas.length || usados.has(indice))
      throw new RecorridoVialError('RUTA_INCOMPLETA', 'Hay paradas duplicadas o desconocidas.')
    if (visita.shipmentLabel != null &&
      (typeof visita.shipmentLabel !== 'string' ||
        porId.get(visita.shipmentLabel) !== indice))
      throw new RecorridoVialError('RESPUESTA_INVALIDA', 'La identidad de una parada no coincide.')
    usados.add(indice)
    ordenPedidoIds.push(paradas[indice].pedidoId)
  }
  if (usados.size !== paradas.length)
    throw new RecorridoVialError('RUTA_INCOMPLETA', 'Faltan pedidos en el recorrido.')
  return {
    ordenPedidoIds,
    totalParadas: paradas.length,
    proveedor: 'GOOGLE_ROUTE_OPTIMIZATION',
    modoVial: 'DRIVING',
  }
}
