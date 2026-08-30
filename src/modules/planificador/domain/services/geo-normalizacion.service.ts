/**
 * Normalización geográfica de un candidato del plan (ADR-PLANIFICADOR-004 §5).
 *
 * Jerarquía de resolución del "ancla":
 *   1. pickCoords (negocio gana, fallback cliente) → punto exacto + calidad
 *   2. barrio efectivo → señal de grupo, sin punto
 *   3. sin nada → NONE (va a excepción, no bloquea la generación)
 *
 * NUNCA geocodifica el string del barrio a un centroide inventado. El centroide
 * de barrio (si aplica) lo calcula `agrupacion.service` a partir de los clientes
 * del barrio que SÍ tienen coords.
 */

import { pickCoords } from '@/lib/geo/pedido-coords'
import {
  deriveLocationQuality,
  esUbicable,
  type LocationQuality,
} from '../value-objects/LocationQuality'

export interface CandidatoGeoInput {
  pedidoId: string
  clienteId: string
  negocioId?: string | null
  cliente: {
    lat: unknown
    lng: unknown
    barrio?: string | null
    geocodeOrigen?: string | null
    geocodeAt?: Date | string | null
    nombre?: string | null
  }
  negocio?: {
    lat: unknown
    lng: unknown
    barrio?: string | null
    nombre?: string | null
  } | null
  /** Snapshot de barrio del pedido, si lo tiene. */
  barrioEntrega?: string | null
}

export interface SenalGeografica {
  pedidoId: string
  clienteId: string
  negocioId: string | null
  lat: number | null
  lng: number | null
  /** De dónde salió el punto. */
  fuente: 'NEGOCIO' | 'CLIENTE' | null
  barrio: string | null
  calidad: LocationQuality
  /** ¿Se puede clusterizar/secuenciar con punto exacto? */
  ubicable: boolean
}

/** Barrio efectivo: override del pedido → negocio → cliente. */
export function pickBarrio(c: CandidatoGeoInput): string | null {
  const raw = c.barrioEntrega ?? c.negocio?.barrio ?? c.cliente.barrio ?? null
  const t = raw?.trim()
  return t ? t : null
}

export function normalizarGeo(c: CandidatoGeoInput, ahora: Date = new Date()): SenalGeografica {
  const barrio = pickBarrio(c)
  const coords = pickCoords({ cliente: c.cliente, negocio: c.negocio ?? undefined })

  // ¿El punto vino del negocio o del cliente? pickCoords prioriza negocio.
  const negocioTieneCoords =
    c.negocio != null && c.negocio.lat != null && c.negocio.lng != null &&
    Number.isFinite(Number(c.negocio.lat)) && Number.isFinite(Number(c.negocio.lng))
  const fuente: 'NEGOCIO' | 'CLIENTE' | null = coords
    ? (negocioTieneCoords ? 'NEGOCIO' : 'CLIENTE')
    : null

  const calidad = deriveLocationQuality(
    {
      lat: coords?.lat,
      lng: coords?.lng,
      // Si el punto es del negocio, no hay geocodeOrigen (Negocio no lo tiene) → APPROX.
      geocodeOrigen: fuente === 'NEGOCIO' ? undefined : c.cliente.geocodeOrigen,
      geocodeAt: fuente === 'NEGOCIO' ? undefined : c.cliente.geocodeAt,
      tieneBarrio: !!barrio,
    },
    ahora,
  )

  return {
    pedidoId: c.pedidoId,
    clienteId: c.clienteId,
    negocioId: c.negocioId ?? null,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    fuente,
    barrio,
    calidad,
    ubicable: coords != null && esUbicable(calidad),
  }
}
