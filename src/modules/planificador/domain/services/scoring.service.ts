/**
 * Función objetivo / scoring de grupo (ADR-PLANIFICADOR-005 §2, v4 §17).
 *
 * Los pesos NO se inventan acá — son config (`Config` keys), defaults abajo.
 * Calibración diferida a semanas de operación real (F0 §0.a punto 5).
 *
 * El score de un grupo es un COSTO (más bajo = mejor). Se usa para ordenar los
 * grupos y para el diff de estabilidad en la replanificación.
 */

export interface PesosOptimizador {
  /** Peso de la distancia total del recorrido (km). */
  wDist: number
  /** Peso de la dispersión (km promedio al centroide). */
  wDisp: number
  /** Peso por preferencia incumplida (barrio/ruta habitual roto). */
  wPref: number
  /** Peso por pedido que cambia de grupo vs. la versión vigente. */
  wEstab: number
  /** Peso por unidad de exceso sobre la capacidad. */
  wCap: number
}

/** Defaults documentados (ADR-PLANIFICADOR-001 §6). `wEstab` alto = favorece estabilidad. */
export const PESOS_DEFAULT: PesosOptimizador = {
  wDist: 1.0,
  wDisp: 0.5,
  wPref: 2.0,
  wEstab: 5.0,
  wCap: 10.0,
}

export interface GrupoScoreInput {
  distanciaKm: number
  dispersionKm: number
  preferenciasIncumplidas: number
  pedidosQueCambianDeGrupo: number
  excesoCapacidadUnidades: number
}

export function scoreGrupo(input: GrupoScoreInput, pesos: PesosOptimizador = PESOS_DEFAULT): number {
  const s =
    pesos.wDist * input.distanciaKm +
    pesos.wDisp * input.dispersionKm +
    pesos.wPref * input.preferenciasIncumplidas +
    pesos.wEstab * input.pedidosQueCambianDeGrupo +
    pesos.wCap * input.excesoCapacidadUnidades
  return Math.round(s * 10000) / 10000
}

/** Dispersión: distancia promedio de los puntos al centroide (km). */
export function dispersionKm(
  puntos: Array<{ lat: number; lng: number }>,
  centroide: { lat: number; lng: number } | null,
): number {
  if (!centroide || puntos.length === 0) return 0
  // haversine inline para no acoplar; import barato igual.
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const d =
    puntos.reduce((sum, p) => {
      const dLat = rad(p.lat - centroide.lat)
      const dLng = rad(p.lng - centroide.lng)
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(centroide.lat)) * Math.cos(rad(p.lat)) * Math.sin(dLng / 2) ** 2
      return sum + 2 * R * Math.asin(Math.sqrt(a))
    }, 0) / puntos.length
  return Math.round(d * 100) / 100
}

export interface ExplicacionGrupo {
  senales: string[]
  texto: string
}

/** Explicación operacional del grupo (v4 §34). Sin matemática. */
export function explicarGrupo(params: {
  tipo: 'PROXIMIDAD' | 'BARRIO' | 'RUTA_HABITUAL' | 'RESTO'
  nParadas: number
  nPedidos: number
  rutaHabitual: string | null
  barrios: string[]
  combinado: boolean
  calidadBaja: number
}): ExplicacionGrupo {
  const senales: string[] = []
  if (params.tipo === 'PROXIMIDAD') senales.push('proximidad geográfica')
  if (params.rutaHabitual) senales.push(`ruta habitual (${params.rutaHabitual})`)
  if (params.barrios.length > 0) senales.push(`barrio${params.barrios.length > 1 ? 's' : ''}: ${params.barrios.join(', ')}`)
  if (params.calidadBaja > 0) senales.push(`${params.calidadBaja} parada(s) con ubicación aproximada`)

  const partes: string[] = []
  partes.push(`${params.nPedidos} pedido(s) en ${params.nParadas} parada(s)`)
  if (params.combinado) partes.push('se combinaron zonas cercanas por baja demanda individual')
  else if (params.tipo === 'PROXIMIDAD') partes.push('agrupadas por cercanía')
  else if (params.tipo === 'BARRIO') partes.push('agrupadas por barrio (sin coordenadas precisas)')
  if (params.rutaHabitual) partes.push(`coincide con el patrón de "${params.rutaHabitual}"`)

  return { senales, texto: partes.join('; ') + '.' }
}
