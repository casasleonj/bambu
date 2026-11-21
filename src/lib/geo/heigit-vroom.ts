/**
 * #930 — Adaptador PURO a HeiGIT openrouteservice / VROOM.
 * Optimiza la secuencia por matriz de tiempos viales de OpenStreetMap.
 * No calcula distancias Haversine ni devuelve mapas/polilíneas.
 *
 * API oficial: https://playground.heigit.org/ (POST /vroom/v0)
 * VROOM: https://github.com/VROOM-Project/vroom/blob/master/docs/API.md
 */
import {
  coordenadaVialValida,
  RecorridoVialError,
  type ParadaVial,
  type ResultadoRecorridoVial,
  type SolicitudRecorridoVial,
} from './google-route-optimization'

const MAX_PARADAS = 25
const VEHICLE_ID = 1

/** La API VROOM usa [longitud, latitud], distinto del objeto de Google. */
export function construirSolicitudVroom(input: SolicitudRecorridoVial) {
  if (!coordenadaVialValida(input.origen))
    throw new RecorridoVialError('COORDENADAS_INVALIDAS', 'El origen no tiene GPS válido.')
  if (!Number.isFinite(input.salida.getTime()))
    throw new RecorridoVialError('PARADAS_INVALIDAS', 'La fecha de salida no es válida.')
  if (input.paradas.length < 1 || input.paradas.length > MAX_PARADAS)
    throw new RecorridoVialError('PARADAS_INVALIDAS', 'Selecciona entre 1 y 25 paradas.')

  const ids = new Set<string>()
  const jobs = input.paradas.map((p, i) => {
    if (!p.pedidoId || p.pedidoId.length > 128 || ids.has(p.pedidoId))
      throw new RecorridoVialError('PARADAS_INVALIDAS', 'Los pedidos deben ser únicos y válidos.')
    if (!coordenadaVialValida(p))
      throw new RecorridoVialError('COORDENADAS_INVALIDAS', 'Hay pedidos sin ubicación GPS válida.')
    ids.add(p.pedidoId)
    // Nunca enviar a terceros nombres, teléfonos, número comercial ni UUID.
    // El ID externo es efímero y se traduce a pedidoId SOLO localmente.
    return {
      id: i + 1,
      location: [p.lng, p.lat] as [number, number],
    }
  })

  return {
    vehicles: [{
      id: VEHICLE_ID,
      profile: 'car',
      start: [input.origen.lng, input.origen.lat] as [number, number],
      // Sin end: ruta abierta hasta el último pedido. No forzar retorno a fábrica.
    }],
    jobs,
    // Sin geometry ni pasos de navegación: solo necesitamos el orden de visitas.
  }
}

function record(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? v as Record<string, unknown>
    : null
}

/**
 * VROOM retorna start, job y a veces end. Cada parada seleccionada debe
 * aparecer como job exactamente una vez, sin unassigned ni rutas adicionales.
 */
export function leerOrdenVroom(
  respuesta: unknown, paradas: readonly ParadaVial[],
): ResultadoRecorridoVial {
  const root = record(respuesta)
  if (!root || root.code !== 0 || !Array.isArray(root.routes) ||
      !Array.isArray(root.unassigned))
    throw new RecorridoVialError('RESPUESTA_INVALIDA', 'El proveedor devolvió una respuesta inválida.')
  if (root.unassigned.length > 0)
    throw new RecorridoVialError('RUTA_INCOMPLETA', 'El proveedor no pudo programar todas las paradas.')

  const summary = record(root.summary)
  if (!summary || summary.unassigned !== 0)
    throw new RecorridoVialError('RUTA_INCOMPLETA', 'La respuesta no confirma todas las paradas.')
  if (root.routes.length !== 1)
    throw new RecorridoVialError('SIN_RUTA', 'No se obtuvo una única ruta vial.')

  const ruta = record(root.routes[0])
  if (!ruta || ruta.vehicle !== VEHICLE_ID || !Array.isArray(ruta.steps))
    throw new RecorridoVialError('RESPUESTA_INVALIDA', 'No hay pasos viales válidos.')
  const orden: string[] = []
  const usados = new Set<number>()
  for (const raw of ruta.steps) {
    const step = record(raw)
    if (!step || typeof step.type !== 'string')
      throw new RecorridoVialError('RESPUESTA_INVALIDA', 'Hay un paso de ruta no reconocido.')
    if (step.type === 'start' || step.type === 'end') continue
    if (step.type !== 'job' || typeof step.id !== 'number' ||
      !Number.isSafeInteger(step.id))
      throw new RecorridoVialError('RESPUESTA_INVALIDA', 'El proveedor devolvió una parada inesperada.')
    const id = step.id
    if (id < 1 || id > paradas.length || usados.has(id))
      throw new RecorridoVialError('RUTA_INCOMPLETA', 'Hay pedidos duplicados o desconocidos.')
    usados.add(id)
    orden.push(paradas[id - 1].pedidoId)
  }
  if (orden.length !== paradas.length)
    throw new RecorridoVialError('RUTA_INCOMPLETA', 'Faltan pedidos en el orden vial.')

  return {
    ordenPedidoIds: orden,
    totalParadas: paradas.length,
    proveedor: 'HEIGIT_VROOM',
    modoVial: 'DRIVING', // car aproximado, no perfil validado de motocarga
  }
}
