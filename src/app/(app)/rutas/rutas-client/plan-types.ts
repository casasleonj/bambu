/** Shape del plan que devuelve `GET /api/rutas/planes*` (ver serialize-plan.ts). */

export type PlanEstado =
  | 'PROPOSED'
  | 'REVIEW'
  | 'CONFIRMED'
  | 'SUPERSEDED'
  | 'CANCELLED'
  | 'INTEGRATION_PARTIAL'

export interface PlanResumen {
  pedidos: number
  paradas: number
  grupos: number
  unidades: number
  excepciones: number
  pedidosSinUbicar: number
}

export interface PlanActividad {
  id: string
  tipo: 'ENTREGA' | 'COBRO' | 'RECOGIDA_BOTELLON'
  pedidoIds: string[]
  snapshotCantidades: Record<string, number> | null
}

export interface PlanParada {
  id: string
  secuencia: number
  clienteId: string
  clienteNombre: string | null
  negocioId: string | null
  negocioNombre: string | null
  ubicacionUsada: { lat: number | null; lng: number | null; fuente: string | null; calidad: string } | null
  motivo: string | null
  actividades: PlanActividad[]
}

export interface PlanGrupo {
  id: string
  nombreLogico: string
  secuencia: number
  capacidadUnidades: number
  cargaPlanificada: Record<string, number>
  trabajadorPropuestoId: string | null
  trabajadorFinalId: string | null
  trabajadorNombre: string | null
  rutaId: string | null
  horaSalidaPropuesta: string | null
  score: number
  distanciaKm: number
  explicacion: { senales: string[]; texto: string } | null
  embarqueId: string | null
  paradas: PlanParada[]
}

export interface PlanExcepcion {
  id: string
  tipo: string
  severidad: 'BAJA' | 'MEDIA' | 'ALTA'
  entidad: { pedidoIds?: string[]; clienteId?: string; grupoNombre?: string } | null
  explicacion: string
  opciones: Array<{ accion: string; label: string }> | null
  estado: 'ABIERTA' | 'RESUELTA' | 'IGNORADA'
}

export interface PlanDia {
  id: string
  fecha: string
  version: number
  estado: PlanEstado
  causa: string | null
  resumen: PlanResumen | null
  updatedAt: string
  generadoEn: string
  confirmadoEn: string | null
  grupos: PlanGrupo[]
  excepciones: PlanExcepcion[]
}
