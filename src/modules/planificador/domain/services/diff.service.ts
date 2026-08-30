/**
 * Diff entre dos versiones de un plan (ADR-PLANIFICADOR-005 §3).
 *
 * "Nunca sobrescribir silenciosamente": cada replanificación/override guarda un
 * diff legible contra la versión anterior. La UI lo muestra antes de aplicar.
 */

export interface PlanSnapshotLite {
  grupos: Array<{
    nombreLogico: string
    trabajadorPropuestoId: string | null
    paradas: Array<{
      clienteId: string
      actividades: Array<{ pedidoIds: string[] }>
    }>
  }>
}

export interface PlanDiff {
  pedidosAgregados: string[]
  pedidosQuitados: string[]
  pedidosMovidos: Array<{ pedidoId: string; de: string; a: string }>
  gruposNuevos: string[]
  gruposEliminados: string[]
  repartidorCambiado: Array<{ grupo: string; de: string | null; a: string | null }>
  sinCambios: boolean
}

function pedidoAGrupo(snap: PlanSnapshotLite): Map<string, string> {
  const m = new Map<string, string>()
  for (const g of snap.grupos) {
    for (const p of g.paradas) {
      for (const a of p.actividades) {
        for (const pid of a.pedidoIds) m.set(pid, g.nombreLogico)
      }
    }
  }
  return m
}

export function diffPlanes(anterior: PlanSnapshotLite, nuevo: PlanSnapshotLite): PlanDiff {
  const antMap = pedidoAGrupo(anterior)
  const nueMap = pedidoAGrupo(nuevo)

  const pedidosAgregados: string[] = []
  const pedidosQuitados: string[] = []
  const pedidosMovidos: PlanDiff['pedidosMovidos'] = []

  for (const [pid, grupoNuevo] of nueMap) {
    const grupoAnt = antMap.get(pid)
    if (grupoAnt === undefined) pedidosAgregados.push(pid)
    else if (grupoAnt !== grupoNuevo) pedidosMovidos.push({ pedidoId: pid, de: grupoAnt, a: grupoNuevo })
  }
  for (const pid of antMap.keys()) {
    if (!nueMap.has(pid)) pedidosQuitados.push(pid)
  }

  const gruposAnt = new Set(anterior.grupos.map((g) => g.nombreLogico))
  const gruposNue = new Set(nuevo.grupos.map((g) => g.nombreLogico))
  const gruposNuevos = [...gruposNue].filter((g) => !gruposAnt.has(g))
  const gruposEliminados = [...gruposAnt].filter((g) => !gruposNue.has(g))

  const repAnt = new Map(anterior.grupos.map((g) => [g.nombreLogico, g.trabajadorPropuestoId]))
  const repartidorCambiado: PlanDiff['repartidorCambiado'] = []
  for (const g of nuevo.grupos) {
    if (repAnt.has(g.nombreLogico)) {
      const de = repAnt.get(g.nombreLogico) ?? null
      if (de !== g.trabajadorPropuestoId) {
        repartidorCambiado.push({ grupo: g.nombreLogico, de, a: g.trabajadorPropuestoId })
      }
    }
  }

  const sinCambios =
    pedidosAgregados.length === 0 &&
    pedidosQuitados.length === 0 &&
    pedidosMovidos.length === 0 &&
    gruposNuevos.length === 0 &&
    gruposEliminados.length === 0 &&
    repartidorCambiado.length === 0

  return {
    pedidosAgregados,
    pedidosQuitados,
    pedidosMovidos,
    gruposNuevos,
    gruposEliminados,
    repartidorCambiado,
    sinCambios,
  }
}

/** Convierte la salida de `construirPropuesta` al shape lite del diff. */
export function toSnapshotLite(propuesta: {
  grupos: Array<{
    nombreLogico: string
    trabajadorPropuestoId: string | null
    paradas: Array<{ clienteId: string; actividades: Array<{ pedidoIds: string[] }> }>
  }>
}): PlanSnapshotLite {
  return {
    grupos: propuesta.grupos.map((g) => ({
      nombreLogico: g.nombreLogico,
      trabajadorPropuestoId: g.trabajadorPropuestoId,
      paradas: g.paradas.map((p) => ({
        clienteId: p.clienteId,
        actividades: p.actividades.map((a) => ({ pedidoIds: a.pedidoIds })),
      })),
    })),
  }
}
