/**
 * Detección de excepciones del planificador (ADR-PLANIFICADOR-001 §4, v4 §21).
 *
 * Modelo propio del planificador — NO es el modelo de excepciones de Embarques
 * (`docs/embarques/03-exception-model.md`). Cada excepción explica qué pasó, por
 * qué importa y qué puede hacer el humano.
 */

export type PlanExcepcionTipo =
  | 'OUTSIDE_USUAL_AREA'
  | 'LOW_LOCATION_CONFIDENCE'
  | 'ISOLATED_DEMAND'
  | 'CAPACITY_CONFLICT'
  | 'RESOURCE_CONFLICT'
  | 'SCHEDULE_CONFLICT'
  | 'NEW_DEMAND'
  | 'MISSING_DATA'

export type Severidad = 'BAJA' | 'MEDIA' | 'ALTA'

export interface PlanExcepcionDraft {
  tipo: PlanExcepcionTipo
  severidad: Severidad
  entidad: { pedidoIds?: string[]; clienteId?: string; grupoNombre?: string }
  explicacion: string
  opciones: Array<{ accion: string; label: string }>
}

export interface DeteccionInput {
  /** Paradas cuyo pedido no tiene coords NI barrio útil. */
  sinUbicacion: Array<{ clienteId: string; pedidoIds: string[] }>
  /** Paradas con ubicación solo aproximada (BARRIO_ONLY o APPROX vieja). */
  ubicacionAproximada: Array<{ clienteId: string; pedidoIds: string[] }>
  /** Grupos de proximidad con 1 sola parada lejos de todo. */
  demandaAislada: Array<{ grupoNombre: string; clienteId: string; pedidoIds: string[]; distanciaKmAlResto: number }>
  /** Grupos cuya carga excede la capacidad tras dividir lo posible. */
  conflictoCapacidad: Array<{ grupoNombre: string; excesoUnidades: number }>
  /** No hay repartidores libres para todos los grupos. */
  gruposSinRecurso: string[]
}

export function detectarExcepciones(input: DeteccionInput): PlanExcepcionDraft[] {
  const out: PlanExcepcionDraft[] = []

  for (const s of input.sinUbicacion) {
    out.push({
      tipo: 'MISSING_DATA',
      severidad: 'ALTA',
      entidad: { clienteId: s.clienteId, pedidoIds: s.pedidoIds },
      explicacion:
        'Este cliente no tiene ni coordenadas ni barrio. No se puede ubicar en ningún grupo con seguridad.',
      opciones: [
        { accion: 'AGREGAR_UBICACION', label: 'Agregar ubicación (link de Maps o barrio)' },
        { accion: 'ASIGNAR_MANUAL', label: 'Asignar manualmente a un grupo' },
        { accion: 'POSPONER', label: 'Dejar fuera del plan de hoy' },
      ],
    })
  }

  for (const a of input.ubicacionAproximada) {
    out.push({
      tipo: 'LOW_LOCATION_CONFIDENCE',
      severidad: 'MEDIA',
      entidad: { clienteId: a.clienteId, pedidoIds: a.pedidoIds },
      explicacion:
        'La ubicación de este cliente es aproximada (solo barrio o coordenadas viejas). Se agrupó por barrio; el orden de visita puede no ser óptimo.',
      opciones: [
        { accion: 'CONFIRMAR', label: 'Está bien así' },
        { accion: 'AGREGAR_UBICACION', label: 'Precisar la ubicación' },
      ],
    })
  }

  for (const d of input.demandaAislada) {
    out.push({
      tipo: 'ISOLATED_DEMAND',
      severidad: d.distanciaKmAlResto > 5 ? 'ALTA' : 'MEDIA',
      entidad: { grupoNombre: d.grupoNombre, clienteId: d.clienteId, pedidoIds: d.pedidoIds },
      explicacion: `Este cliente está a ~${d.distanciaKmAlResto.toFixed(1)} km del resto de su grupo. Atenderlo solo agrega recorrido.`,
      opciones: [
        { accion: 'INCLUIR', label: 'Incluir de todos modos (asumir el recorrido extra)' },
        { accion: 'COMBINAR', label: 'Combinar con otro grupo cercano' },
        { accion: 'POSPONER', label: 'Reprogramar para otro día' },
      ],
    })
  }

  for (const c of input.conflictoCapacidad) {
    out.push({
      tipo: 'CAPACITY_CONFLICT',
      severidad: 'ALTA',
      entidad: { grupoNombre: c.grupoNombre },
      explicacion: `El grupo "${c.grupoNombre}" excede la capacidad de una moto en ${c.excesoUnidades} unidad(es) y no se pudo dividir sin romper la zona.`,
      opciones: [
        { accion: 'DIVIDIR', label: 'Dividir en dos salidas' },
        { accion: 'SEGUNDA_MOTO', label: 'Asignar una segunda moto' },
        { accion: 'POSPONER_PARCIAL', label: 'Dejar parte para mañana' },
      ],
    })
  }

  for (const g of input.gruposSinRecurso) {
    out.push({
      tipo: 'RESOURCE_CONFLICT',
      severidad: 'ALTA',
      entidad: { grupoNombre: g },
      explicacion: `No hay un repartidor disponible para el grupo "${g}".`,
      opciones: [
        { accion: 'REASIGNAR', label: 'Reasignar un repartidor de otro grupo' },
        { accion: 'POSPONER', label: 'Dejar el grupo para más tarde' },
      ],
    })
  }

  return out
}
