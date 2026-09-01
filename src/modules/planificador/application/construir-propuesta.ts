/**
 * Pipeline puro del motor de planificación (ADR-PLANIFICADOR-001 §3).
 *
 *   candidatos → normalización geo → paradas lógicas → agrupación →
 *   capacidad → secuencia → scoring → excepciones → propuesta
 *
 * Determinista: mismos inputs → misma propuesta. Sin I/O. La carga de datos y la
 * persistencia viven en `GenerarPlanUseCase` + el repositorio.
 */

import { normalizarGeo, type CandidatoGeoInput } from '../domain/services/geo-normalizacion.service'
import { agrupar, type ParadaAgrupable } from '../domain/services/agrupacion.service'
import {
  cargaAgregada,
  unidadesTotales,
  dividirPorCapacidad,
  type PedidoCantidades,
  type Producto,
} from '../domain/services/capacidad.service'
import { secuenciar } from '../domain/services/secuenciacion.service'
import {
  scoreGrupo,
  dispersionKm,
  explicarGrupo,
  PESOS_DEFAULT,
  type PesosOptimizador,
} from '../domain/services/scoring.service'
import { detectarExcepciones, type PlanExcepcionDraft } from '../domain/services/excepciones.service'
import { haversineKm } from '@/lib/geo/haversine'

export interface CandidatoPedido {
  pedidoId: string
  clienteId: string
  negocioId: string | null
  cantidades: PedidoCantidades
  geo: CandidatoGeoInput
  /** rutaId efectivo (negocio.rutaId ?? cliente.rutaId). */
  rutaId: string | null
  clienteNombre: string
}

export interface ConstruirPropuestaInput {
  fecha: string
  candidatos: CandidatoPedido[]
  /** Repartidores disponibles (no ocupados hoy). */
  repartidoresDisponibles: Array<{ id: string; nombre: string; rutaIdsPreferidas: string[] }>
  maxUnidades: number
  nombresRuta: Record<string, string>
  pesos?: PesosOptimizador
  /** Para el peso de estabilidad: mapa pedidoId → grupoNombre de la versión vigente. */
  grupoAnteriorPorPedido?: Record<string, string>
}

export interface PropuestaParada {
  clienteId: string
  negocioId: string | null
  secuencia: number
  ubicacionUsada: { lat: number | null; lng: number | null; fuente: string | null; calidad: string }
  motivo: string
  actividades: Array<{ tipo: 'ENTREGA'; pedidoIds: string[]; snapshotCantidades: Record<string, number> }>
}

export interface PropuestaGrupo {
  nombreLogico: string
  secuencia: number
  tipo: 'PROXIMIDAD' | 'BARRIO' | 'RUTA_HABITUAL' | 'RESTO'
  capacidadUnidades: number
  cargaPlanificada: Record<Producto, number>
  trabajadorPropuestoId: string | null
  rutaId: string | null
  distanciaKm: number
  score: number
  explicacion: { senales: string[]; texto: string }
  paradas: PropuestaParada[]
}

export interface Propuesta {
  fecha: string
  grupos: PropuestaGrupo[]
  excepciones: PlanExcepcionDraft[]
  resumen: {
    pedidos: number
    paradas: number
    grupos: number
    unidades: number
    excepciones: number
    pedidosSinUbicar: number
  }
}

/** key de parada lógica: un cliente o un cliente+negocio concreto. */
function paradaKey(clienteId: string, negocioId: string | null): string {
  return negocioId ? `${clienteId}:${negocioId}` : clienteId
}

export function construirPropuesta(input: ConstruirPropuestaInput): Propuesta {
  const { fecha, candidatos, maxUnidades, nombresRuta } = input
  const pesos = input.pesos ?? PESOS_DEFAULT
  const grupoAnterior = input.grupoAnteriorPorPedido ?? {}

  // --- 1. Normalización geográfica por pedido.
  const senales = new Map(candidatos.map((c) => [c.pedidoId, normalizarGeo(c.geo)]))

  // --- 2. Paradas lógicas: agrupar pedidos por (cliente, negocio).
  const paradasMap = new Map<string, CandidatoPedido[]>()
  for (const c of candidatos) {
    const k = paradaKey(c.clienteId, c.negocioId)
    const arr = paradasMap.get(k) ?? []
    arr.push(c)
    paradasMap.set(k, arr)
  }

  const paradasAgrupables: ParadaAgrupable[] = []
  for (const [key, peds] of paradasMap) {
    // La señal de la parada = la mejor de sus pedidos (todos son del mismo cliente/negocio).
    const s = senales.get(peds[0].pedidoId)!
    paradasAgrupables.push({
      key,
      clienteId: peds[0].clienteId,
      negocioId: peds[0].negocioId,
      lat: s.lat,
      lng: s.lng,
      ubicable: s.ubicable,
      barrio: s.barrio,
      rutaId: peds[0].rutaId,
    })
  }

  // --- 3. Agrupación.
  const { grupos: gruposCand, sinAgrupar } = agrupar(paradasAgrupables, { nombresRuta, minParadasParaClusterizar: 4 })

  // --- 4/5/6. Por cada grupo candidato: capacidad, secuencia, score, explicación.
  const paradaPorKey = new Map(paradasAgrupables.map((p) => [p.key, p]))
  const grupos: PropuestaGrupo[] = []
  const conflictoCapacidad: Array<{ grupoNombre: string; excesoUnidades: number }> = []
  const demandaAislada: Array<{ grupoNombre: string; clienteId: string; pedidoIds: string[]; distanciaKmAlResto: number }> = []

  for (const gc of gruposCand) {
    // Pedidos del grupo, en el orden de sus paradas.
    const pedidosDelGrupo: CandidatoPedido[] = gc.keys.flatMap((k) => paradasMap.get(k) ?? [])

    // Split por capacidad → sub-grupos.
    const subGrupos = dividirPorCapacidad(
      pedidosDelGrupo.map((c) => ({ ...c.cantidades, __ref: c })) as Array<PedidoCantidades & { __ref: CandidatoPedido }>,
      maxUnidades,
    )

    subGrupos.forEach((sg, sgIdx) => {
      const peds = sg.map((x) => (x as PedidoCantidades & { __ref: CandidatoPedido }).__ref)
      const keys = [...new Set(peds.map((p) => paradaKey(p.clienteId, p.negocioId)))]
      const paradasG = keys.map((k) => paradaPorKey.get(k)!).filter(Boolean)

      const unidades = unidadesTotales(peds.map((p) => p.cantidades))
      const exceso = Math.max(0, unidades - maxUnidades)
      if (exceso > 0) conflictoCapacidad.push({ grupoNombre: gc.nombre, excesoUnidades: exceso })

      // Secuencia.
      const seq = secuenciar(paradasG.map((p) => ({ key: p.key, lat: p.lat, lng: p.lng })))
      const ordenIdx = new Map(seq.orden.map((k, i) => [k, i]))

      // Dispersión + demanda aislada.
      const puntos = paradasG.filter((p) => p.lat != null && p.lng != null).map((p) => ({ lat: p.lat as number, lng: p.lng as number }))
      const disp = dispersionKm(puntos, gc.centroide)
      if (paradasG.length >= 2 && gc.centroide) {
        for (const p of paradasG) {
          if (p.lat == null) continue
          const d = haversineKm({ lat: p.lat, lng: p.lng as number }, gc.centroide)
          if (d > Math.max(3, disp * 3)) {
            const pj = peds.filter((x) => paradaKey(x.clienteId, x.negocioId) === p.key)
            demandaAislada.push({
              grupoNombre: gc.nombre,
              clienteId: p.clienteId,
              pedidoIds: pj.map((x) => x.pedidoId),
              distanciaKmAlResto: Math.round(d * 10) / 10,
            })
          }
        }
      }

      // Preferencias incumplidas: paradas cuyo rutaId ≠ rutaId dominante del grupo.
      const prefIncumplidas = gc.rutaId
        ? paradasG.filter((p) => p.rutaId && p.rutaId !== gc.rutaId).length
        : 0

      // Estabilidad: pedidos que cambian de grupo vs. versión anterior.
      const cambian = peds.filter(
        (p) => grupoAnterior[p.pedidoId] && grupoAnterior[p.pedidoId] !== gc.nombre,
      ).length

      const score = scoreGrupo(
        {
          distanciaKm: seq.distanciaKm,
          dispersionKm: disp,
          preferenciasIncumplidas: prefIncumplidas,
          pedidosQueCambianDeGrupo: cambian,
          excesoCapacidadUnidades: exceso,
        },
        pesos,
      )

      const barrios = [...new Set(paradasG.map((p) => p.barrio).filter(Boolean))] as string[]
      const calidadBaja = paradasG.filter((p) => !p.ubicable).length
      const explicacion = explicarGrupo({
        tipo: gc.tipo,
        nParadas: paradasG.length,
        nPedidos: peds.length,
        rutaHabitual: gc.rutaId ? (nombresRuta[gc.rutaId] ?? null) : null,
        barrios,
        combinado: barrios.length > 1 && gc.tipo === 'PROXIMIDAD',
        calidadBaja,
      })

      const nombre = subGrupos.length > 1 ? `${gc.nombre} (${sgIdx + 1}/${subGrupos.length})` : gc.nombre

      const paradasProp: PropuestaParada[] = paradasG
        .map((p) => {
          const pedsParada = peds.filter((x) => paradaKey(x.clienteId, x.negocioId) === p.key)
          const s = senales.get(pedsParada[0].pedidoId)!
          return {
            clienteId: p.clienteId,
            negocioId: p.negocioId,
            secuencia: ordenIdx.get(p.key) ?? 999,
            ubicacionUsada: { lat: s.lat, lng: s.lng, fuente: s.fuente, calidad: s.calidad },
            motivo: gc.tipo === 'PROXIMIDAD' ? 'PROXIMIDAD' : gc.tipo === 'BARRIO' ? 'BARRIO' : 'RUTA_HABITUAL',
            actividades: [
              {
                tipo: 'ENTREGA' as const,
                pedidoIds: pedsParada.map((x) => x.pedidoId),
                snapshotCantidades: cargaAgregada(pedsParada.map((x) => x.cantidades)),
              },
            ],
          }
        })
        .sort((a, b) => a.secuencia - b.secuencia)

      grupos.push({
        nombreLogico: nombre,
        secuencia: grupos.length,
        tipo: gc.tipo,
        capacidadUnidades: unidades,
        cargaPlanificada: cargaAgregada(peds.map((p) => p.cantidades)),
        trabajadorPropuestoId: null, // se asigna abajo
        rutaId: gc.rutaId,
        distanciaKm: seq.distanciaKm,
        score,
        explicacion,
        paradas: paradasProp,
      })
    })
  }

  // --- Ordenar grupos por score (mejor primero) y asignar repartidor.
  grupos.sort((a, b) => a.score - b.score)
  grupos.forEach((g, i) => { g.secuencia = i })
  const gruposSinRecurso: string[] = []
  const disponibles = [...input.repartidoresDisponibles]
  for (const g of grupos) {
    let idx = g.rutaId ? disponibles.findIndex((r) => r.rutaIdsPreferidas.includes(g.rutaId!)) : -1
    if (idx < 0 && disponibles.length > 0) idx = 0
    if (idx >= 0) {
      g.trabajadorPropuestoId = disponibles[idx].id
      disponibles.splice(idx, 1)
    } else {
      gruposSinRecurso.push(g.nombreLogico)
    }
  }

  // --- Excepciones.
  const sinUbicacion: Array<{ clienteId: string; pedidoIds: string[] }> = []
  const ubicacionAproximada: Array<{ clienteId: string; pedidoIds: string[] }> = []
  for (const [key, peds] of paradasMap) {
    void key
    const s = senales.get(peds[0].pedidoId)!
    if (s.calidad === 'NONE') sinUbicacion.push({ clienteId: peds[0].clienteId, pedidoIds: peds.map((p) => p.pedidoId) })
    else if (s.calidad === 'BARRIO_ONLY' || s.calidad === 'APPROX')
      ubicacionAproximada.push({ clienteId: peds[0].clienteId, pedidoIds: peds.map((p) => p.pedidoId) })
  }

  const excepciones = detectarExcepciones({
    sinUbicacion,
    ubicacionAproximada,
    demandaAislada,
    conflictoCapacidad,
    gruposSinRecurso,
  })

  const totalPedidos = candidatos.length
  const totalParadas = grupos.reduce((s, g) => s + g.paradas.length, 0)
  const totalUnidades = grupos.reduce((s, g) => s + g.capacidadUnidades, 0)

  // Pedidos que NO quedaron en ningún grupo (sin coords ni barrio → excepción).
  const enGrupo = new Set(
    grupos.flatMap((g) => g.paradas.flatMap((p) => p.actividades.flatMap((a) => a.pedidoIds))),
  )
  const pedidosSinUbicar = candidatos.filter((c) => !enGrupo.has(c.pedidoId)).length
  void sinAgrupar

  return {
    fecha,
    grupos,
    excepciones,
    resumen: {
      pedidos: totalPedidos,
      paradas: totalParadas,
      grupos: grupos.length,
      unidades: totalUnidades,
      excepciones: excepciones.length,
      pedidosSinUbicar,
    },
  }
}
