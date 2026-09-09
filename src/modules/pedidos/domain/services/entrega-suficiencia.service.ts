/**
 * resolverEntrega — autoridad ÚNICA de dominio para la suficiencia de la
 * información de entrega de un Pedido (docs/pedidos/entrega-suficiencia-plan.md).
 *
 * Función PURA (sin I/O). La resolución de `linkUbicacion → coords` (que sí
 * hace I/O) ocurre ANTES, en el caller server-side, y se pasa como
 * `coordsDeLink`. Preview y Commit usan ESTA misma función — el frontend NO
 * re-implementa la lógica (G7).
 *
 * Principio: para un Pedido DOMICILIO el sistema exige información SUFICIENTE
 * para identificar y ejecutar la entrega, no un set fijo de campos.
 *   - Vía A: ubicación geográfica utilizable (lat/lng válidas + dentro de
 *     cobertura + fuente utilizable).
 *   - Vía B: dirección textual (no vacía). El barrio SOLO nunca basta; el
 *     `linkUbicacion` SOLO nunca basta (debe resolverse a coords → Vía A).
 */

import { pickCoords } from '@/lib/geo/pedido-coords'

export interface EntregaFuente {
  direccion?: string | null
  barrio?: string | null
  referencia?: string | null
  linkUbicacion?: string | null
  lat?: unknown
  lng?: unknown
  geocodeOrigen?: string | null
}

export interface ResolverEntregaInput {
  canal: 'PUNTO' | 'DOMICILIO'
  /** snapshot del pedido — gana sobre negocio/cliente (misma prioridad que pickDireccionTexto). */
  overrideDireccion?: string | null
  overrideBarrio?: string | null
  cliente?: EntregaFuente | null
  negocio?: EntregaFuente | null
  /** coords resueltas en vivo desde linkUbicacion (server-only), si el caller lo intentó. */
  coordsDeLink?: { lat: number; lng: number } | null
}

export type EstadoEntrega =
  | 'SUFICIENTE'
  | 'SUFICIENTE_COMPLEMENTARIA_FALTANTE'
  | 'INSUFICIENTE'

export interface EntregaResuelta {
  estado: EstadoEntrega
  via: 'GEO' | 'TEXTO' | null
  direccion: string | null
  barrio: string | null
  referencia: string | null
  coords: { lat: number; lng: number; origen: string | null } | null
  linkUbicacion: string | null
  /** null si no había link; true/false según se pudo resolver a coords. */
  linkResoluble: boolean | null
  cobertura: 'no_evaluada' | 'dentro' | 'fuera'
  faltaComplementario: Array<'direccion' | 'barrio' | 'referencia'>
  faltaBloqueante: Array<'direccion' | 'ubicacion'>
}

const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const hasTxt = (v: unknown): boolean => txt(v).length > 0

/**
 * Cobertura de entrega. NO existe una política de cobertura formal
 * (blueprint §8.1bis PENDIENTE cuantitativo). Hasta que negocio la defina,
 * este stub NUNCA produce INSUFICIENTE — solo expone el punto de extensión.
 */
export function dentroDeCobertura(_lat: number, _lng: number): 'no_evaluada' | 'dentro' | 'fuera' {
  return 'no_evaluada'
}

const coordValida = (lat: number, lng: number): boolean =>
  Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)

function coordsUtilizables(input: ResolverEntregaInput): { lat: number; lng: number; origen: string | null } | null {
  // pickCoords valida isFinite y salta null; NO descarta el literal (0,0)
  // (Golfo de Guinea) — eso lo hace `coordValida` acá. Prioridad negocio → cliente.
  const efectivas = pickCoords({
    cliente: input.cliente ? { lat: input.cliente.lat ?? null, lng: input.cliente.lng ?? null } : null,
    negocio: input.negocio ? { lat: input.negocio.lat ?? null, lng: input.negocio.lng ?? null } : null,
  })
  if (efectivas && coordValida(efectivas.lat, efectivas.lng)) {
    const deNegocio =
      input.negocio != null && input.negocio.lat != null && input.negocio.lng != null &&
      Number(input.negocio.lat) === efectivas.lat && Number(input.negocio.lng) === efectivas.lng
    const origen = deNegocio ? 'NEGOCIO' : (input.cliente?.geocodeOrigen ?? 'DESCONOCIDO')
    return { lat: efectivas.lat, lng: efectivas.lng, origen }
  }
  // Sin coords almacenadas: usar las resueltas del link (si el caller las pasó).
  const cl = input.coordsDeLink
  if (cl && coordValida(cl.lat, cl.lng)) {
    return { lat: cl.lat, lng: cl.lng, origen: 'PARSED_URL' }
  }
  return null
}

export function resolverEntrega(input: ResolverEntregaInput): EntregaResuelta {
  // Texto efectivo — ATÓMICO por fuente (igual que pickDireccionTexto):
  // override (si tiene algo) → negocio → cliente.
  let direccion: string | null = null
  let barrio: string | null = null
  let referencia: string | null = null
  let linkUbicacion: string | null = null

  const overrideTieneAlgo = hasTxt(input.overrideDireccion) || hasTxt(input.overrideBarrio)
  if (overrideTieneAlgo) {
    direccion = txt(input.overrideDireccion) || null
    barrio = txt(input.overrideBarrio) || null
  } else if (input.negocio && (hasTxt(input.negocio.direccion) || hasTxt(input.negocio.barrio))) {
    direccion = txt(input.negocio.direccion) || null
    barrio = txt(input.negocio.barrio) || null
  } else if (input.cliente && (hasTxt(input.cliente.direccion) || hasTxt(input.cliente.barrio))) {
    direccion = txt(input.cliente.direccion) || null
    barrio = txt(input.cliente.barrio) || null
  }
  // referencia y link: negocio gana si tiene, si no cliente (no hay override).
  referencia = txt(input.negocio?.referencia) || txt(input.cliente?.referencia) || null
  linkUbicacion = txt(input.negocio?.linkUbicacion) || txt(input.cliente?.linkUbicacion) || null

  const tieneLink = linkUbicacion != null
  const coords = coordsUtilizables(input)
  const cobertura = coords ? dentroDeCobertura(coords.lat, coords.lng) : 'no_evaluada'
  const linkResoluble = tieneLink
    ? (coords != null && (coords.origen === 'PARSED_URL' || input.coordsDeLink != null))
    : null

  // PUNTO: retiro en mostrador — sin domicilio.
  if (input.canal === 'PUNTO') {
    return {
      estado: 'SUFICIENTE', via: null,
      direccion, barrio, referencia, coords, linkUbicacion, linkResoluble,
      cobertura, faltaComplementario: [], faltaBloqueante: [],
    }
  }

  const viaA = coords != null && cobertura !== 'fuera'
  const viaB = direccion != null && direccion.length > 0

  if (!viaA && !viaB) {
    return {
      estado: 'INSUFICIENTE', via: null,
      direccion, barrio, referencia, coords, linkUbicacion, linkResoluble,
      cobertura, faltaComplementario: [], faltaBloqueante: ['direccion', 'ubicacion'],
    }
  }

  const faltaComplementario: EntregaResuelta['faltaComplementario'] = []
  if (!direccion) faltaComplementario.push('direccion')
  if (!barrio) faltaComplementario.push('barrio')

  return {
    estado: faltaComplementario.length > 0 ? 'SUFICIENTE_COMPLEMENTARIA_FALTANTE' : 'SUFICIENTE',
    via: viaA ? 'GEO' : 'TEXTO',
    direccion, barrio, referencia, coords, linkUbicacion, linkResoluble,
    cobertura, faltaComplementario, faltaBloqueante: [],
  }
}
