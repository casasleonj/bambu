/**
 * Agrupación de la demanda elegible (ADR-PLANIFICADOR-001, v4 §11-§15).
 *
 * Compone señales, NO reimplementa algoritmos (F0 §1):
 *   - señal fuerte: proximidad geográfica (DBSCAN sobre paradas ubicables)
 *   - señal de apoyo: barrio (para las paradas sin coords + como nombre de grupo)
 *   - señal de apoyo: ruta habitual (`rutaId` efectivo) — nombra/sesga, no particiona
 *
 * Degradación con gracia (F0 §0.a punto 2): con 2-3 paradas no clusteriza —
 * las mete en un solo grupo. DBSCAN aporta a escala.
 *
 * NO geocodifica el nombre del barrio. El "centroide de barrio" se deriva de las
 * paradas del barrio que SÍ tienen coords (ADR-PLANIFICADOR-004 §3); si el barrio
 * no tiene ≥2 coords, no se puede combinar por proximidad → queda como grupo
 * propio y (si es chico) genera excepción `ISOLATED_DEMAND` aguas abajo.
 */

import { dbscan, type DBSCANPoint } from '@/lib/geo/dbscan'
import { haversineKm } from '@/lib/geo/haversine'

export interface ParadaAgrupable {
  /** id de la parada lógica (clienteId o clienteId:negocioId). */
  key: string
  clienteId: string
  negocioId: string | null
  lat: number | null
  lng: number | null
  ubicable: boolean
  barrio: string | null
  /** rutaId efectivo (negocio.rutaId ?? cliente.rutaId), o null. */
  rutaId: string | null
}

export interface GrupoCandidato {
  /** Origen del grupo, para explicabilidad. */
  tipo: 'PROXIMIDAD' | 'BARRIO' | 'RUTA_HABITUAL' | 'RESTO'
  nombre: string
  keys: string[]
  /** Centroide si es de proximidad. */
  centroide: { lat: number; lng: number } | null
  /** rutaId dominante entre las paradas, si hay. */
  rutaId: string | null
}

export interface AgrupacionOptions {
  /** Radio de vecindad DBSCAN, km. Default 1.5. */
  epsKm?: number
  /** Mínimo de vecinos para core. Default 2 (bajo, negocio chico). */
  minPts?: number
  /**
   * Por debajo de este número de paradas ubicables NO se clusteriza (todas a un
   * grupo). Default 4 (F0: "2-3 paradas = orden simple").
   */
  minParadasParaClusterizar?: number
  /** Nombres de ruta por id, para etiquetar los grupos. */
  nombresRuta?: Record<string, string>
}

function rutaDominante(paradas: ParadaAgrupable[]): string | null {
  const conteo = new Map<string, number>()
  for (const p of paradas) {
    if (p.rutaId) conteo.set(p.rutaId, (conteo.get(p.rutaId) ?? 0) + 1)
  }
  let best: string | null = null
  let bestN = 0
  for (const [id, n] of conteo) {
    if (n > bestN) { best = id; bestN = n }
  }
  return best
}

function centroide(paradas: ParadaAgrupable[]): { lat: number; lng: number } | null {
  const pts = paradas.filter((p) => p.lat != null && p.lng != null)
  if (pts.length === 0) return null
  const lat = pts.reduce((s, p) => s + (p.lat as number), 0) / pts.length
  const lng = pts.reduce((s, p) => s + (p.lng as number), 0) / pts.length
  return { lat, lng }
}

function nombreDeGrupo(
  tipo: GrupoCandidato['tipo'],
  paradas: ParadaAgrupable[],
  nombresRuta: Record<string, string>,
  idx: number,
): string {
  const ruta = rutaDominante(paradas)
  if (ruta && nombresRuta[ruta]) return nombresRuta[ruta]
  const barrios = [...new Set(paradas.map((p) => p.barrio).filter(Boolean))] as string[]
  if (barrios.length === 1) return barrios[0]
  if (barrios.length === 2) return `${barrios[0]} + ${barrios[1]}`
  if (tipo === 'PROXIMIDAD') return `Zona ${idx + 1}`
  return `Grupo ${idx + 1}`
}

export function agrupar(
  paradas: ParadaAgrupable[],
  opts: AgrupacionOptions = {},
): { grupos: GrupoCandidato[]; sinAgrupar: string[] } {
  const epsKm = opts.epsKm ?? 1.5
  const minPts = opts.minPts ?? 2
  const minParaClusterizar = opts.minParadasParaClusterizar ?? 4
  const nombresRuta = opts.nombresRuta ?? {}

  const byKey = new Map(paradas.map((p) => [p.key, p]))
  const ubicables = paradas.filter((p) => p.ubicable && p.lat != null && p.lng != null)
  const noUbicables = paradas.filter((p) => !ubicables.includes(p))

  const grupos: GrupoCandidato[] = []

  // --- 1. Paradas ubicables: proximidad (DBSCAN) o, a bajo volumen, un solo grupo.
  if (ubicables.length > 0 && ubicables.length < minParaClusterizar) {
    grupos.push({
      tipo: 'PROXIMIDAD',
      nombre: nombreDeGrupo('PROXIMIDAD', ubicables, nombresRuta, 0),
      keys: ubicables.map((p) => p.key),
      centroide: centroide(ubicables),
      rutaId: rutaDominante(ubicables),
    })
  } else if (ubicables.length >= minParaClusterizar) {
    const pts: DBSCANPoint[] = ubicables.map((p) => ({
      id: p.key, lat: p.lat as number, lng: p.lng as number,
    }))
    const r = dbscan(pts, { epsKm, minPts })

    r.clusters.forEach((c, i) => {
      const ps = c.puntos.map((pt) => byKey.get(pt.id)!).filter(Boolean)
      grupos.push({
        tipo: 'PROXIMIDAD',
        nombre: nombreDeGrupo('PROXIMIDAD', ps, nombresRuta, i),
        keys: ps.map((p) => p.key),
        centroide: { lat: c.centroide.lat, lng: c.centroide.lng },
        rutaId: rutaDominante(ps),
      })
    })

    // Outliers ubicables: intentar adjuntar al cluster más cercano dentro de 2·eps;
    // si no, cada uno queda como micro-grupo (excepción ISOLATED_DEMAND aguas abajo).
    for (const out of r.outliers) {
      const parada = byKey.get(out.id)!
      let mejor: GrupoCandidato | null = null
      let mejorDist = Infinity
      for (const g of grupos) {
        if (!g.centroide) continue
        const d = haversineKm(out, g.centroide)
        if (d < mejorDist) { mejorDist = d; mejor = g }
      }
      if (mejor && mejorDist <= epsKm * 2) {
        mejor.keys.push(parada.key)
      } else {
        grupos.push({
          tipo: 'PROXIMIDAD',
          nombre: nombreDeGrupo('PROXIMIDAD', [parada], nombresRuta, grupos.length),
          keys: [parada.key],
          centroide: parada.lat != null ? { lat: parada.lat, lng: parada.lng as number } : null,
          rutaId: parada.rutaId,
        })
      }
    }
  }

  // --- 2. Paradas sin coords: agrupar por barrio. Sin barrio → 'sinAgrupar'.
  const sinAgrupar: string[] = []
  const porBarrio = new Map<string, ParadaAgrupable[]>()
  for (const p of noUbicables) {
    if (p.barrio) {
      const arr = porBarrio.get(p.barrio) ?? []
      arr.push(p)
      porBarrio.set(p.barrio, arr)
    } else {
      sinAgrupar.push(p.key)
    }
  }
  for (const [barrio, ps] of porBarrio) {
    // ¿Hay un grupo de proximidad que ya "es" este barrio? Adjuntar ahí.
    const grupoDelBarrio = grupos.find(
      (g) => g.tipo === 'PROXIMIDAD' && g.nombre === barrio,
    )
    if (grupoDelBarrio) {
      grupoDelBarrio.keys.push(...ps.map((p) => p.key))
    } else {
      grupos.push({
        tipo: 'BARRIO',
        nombre: barrio,
        keys: ps.map((p) => p.key),
        centroide: null,
        rutaId: rutaDominante(ps),
      })
    }
  }

  return { grupos, sinAgrupar }
}
