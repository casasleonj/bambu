export interface BarrioAnalysis {
  barrio: string
  totalEntregas: number
  repartidores: Array<{
    trabajadorId: string
    nombre: string
    entregas: number
    porcentaje: number
  }>
  repartidorSugerido?: {
    trabajadorId: string
    nombre: string
    confianza: number
  }
  conflicto?: boolean
  conflictoDetalle?: string
}

export interface RutaConflict {
  barrio: string
  repartidorActual: string
  repartidorInvadiendo: string
  entregasInvadiendo: number
  severidad: 'baja' | 'media' | 'alta'
}

export interface Sugerencia {
  tipo: 'asignar' | 'unificar' | 'investigar'
  barrio: string
  mensaje: string
  datos: Record<string, unknown>
}

export interface CalidadDatos {
  clientesActivos: number
  conCoords: number
  conBarrio: number
  conRuta: number
  sinGeoUtil: number
  barriosDistintos: number
  conLinkUbicacion: number
  negociosActivos: number
  negociosConCoords: number
  pctCoords: number
  pctBarrio: number
  demanda60d: {
    pedidos: number
    conCoordsEfectivas: number
    conBarrioEfectivo: number
    pctCoords: number
  }
  recomendacion: 'OK' | 'BACKFILL_SUGERIDO' | 'BACKFILL_NECESARIO'
}
