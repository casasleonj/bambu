/**
 * #929: contrato puro del riesgo operacional. Un pedido viejo no equivale
 * automáticamente a "sin gestionar": creación, entregas, asignación y fecha
 * prometida tienen significados distintos.
 *
 * Se consume desde el detector de banners/filtro y las tarjetas de Pedidos.
 * El reloj y los turnos provienen del servidor, nunca del dispositivo.
 */
import { minutosHabilesTranscurridos, type Turno } from './business-hours'
import { diaEntregaBogota } from './pedidos-entregas-historial'

export interface PedidoRiesgoCandidato {
  estadoEntrega: string
  embarqueId?: string | null
  createdAt: Date | string
  fechaEntrega?: Date | string | null
  items?: ReadonlyArray<{ cantEntrega: number; cantRegaloEntrega?: number | null }>
  cPacaAguaEnt?: number
  cPacaHieloEnt?: number
  cBotellonFabEnt?: number
  cBotellonDomEnt?: number
  cBolsaAguaEnt?: number
  cBolsaHieloEnt?: number
}

export interface RiesgoOperativo {
  tipo: 'sin_gestionar' | 'sin_reasignar' | 'en_ruta'
  causa: 'tiempo' | 'embarques'
  /** Tiempo HÁBIL desde el inicio aplicable, no desde la última gestión. */
  minutosHabiles: number | null
}

function tieneEntregaParcial(p: PedidoRiesgoCandidato): boolean {
  return Boolean(
    p.items?.some(i => i.cantEntrega > 0 || (i.cantRegaloEntrega ?? 0) > 0) ||
    [
      p.cPacaAguaEnt, p.cPacaHieloEnt, p.cBotellonFabEnt,
      p.cBotellonDomEnt, p.cBolsaAguaEnt, p.cBolsaHieloEnt,
    ].some(n => (n ?? 0) > 0)
  )
}

/** La posibilidad de generar riesgo se evalúa también para la regla de embarques. */
export function elegibleRiesgoOperativo(p: PedidoRiesgoCandidato, ahora: Date): boolean {
  if (!['PENDIENTE', 'NO_ENTREGADO', 'EN_RUTA'].includes(p.estadoEntrega)) return false
  if (p.estadoEntrega !== 'EN_RUTA' && p.embarqueId) return false
  // Una entrega parcial es gestión real. Sin evento de última gestión no hay
  // base legítima para imputarle N horas de "abandono" desde la creación.
  if (tieneEntregaParcial(p)) return false
  if (p.fechaEntrega) {
    const prevista = new Date(p.fechaEntrega)
    if (!Number.isFinite(prevista.getTime())) return false
    if (diaEntregaBogota(prevista) > diaEntregaBogota(ahora)) return false
  }
  return true
}

function tipoRiesgo(estadoEntrega: string): RiesgoOperativo['tipo'] {
  return estadoEntrega === 'EN_RUTA' ? 'en_ruta'
    : estadoEntrega === 'NO_ENTREGADO' ? 'sin_reasignar'
    : 'sin_gestionar'
}

/**
 * Para una entrega programada, el reloj comienza como pronto al llegar el
 * día prometido en Bogotá; minutos fuera de turnos no cuentan. "Hora acordada"
 * entregaNoAntesDe NO se usa como deadline (#836).
 */
export function evaluarRiesgoPorTiempo(
  p: PedidoRiesgoCandidato,
  ahora: Date,
  turnos: Turno[],
  umbralHoras: number,
): RiesgoOperativo | null {
  if (!elegibleRiesgoOperativo(p, ahora) || !Number.isFinite(umbralHoras) || umbralHoras <= 0) return null
  const creacion = new Date(p.createdAt)
  if (!Number.isFinite(creacion.getTime()) || creacion > ahora) return null
  let desde = creacion
  if (p.fechaEntrega) {
    const prevista = new Date(p.fechaEntrega)
    const inicioFechaPrevista = new Date(`${diaEntregaBogota(prevista)}T00:00:00-05:00`)
    if (inicioFechaPrevista > desde) desde = inicioFechaPrevista
  }
  const minutos = minutosHabilesTranscurridos(desde, ahora, turnos)
  if (minutos < umbralHoras * 60) return null
  return { tipo: tipoRiesgo(p.estadoEntrega), causa: 'tiempo', minutosHabiles: Math.floor(minutos) }
}

/** Motivo alternativo ya vigente: demasiados embarques cerrados sin asignar. */
export function riesgoPorEmbarques(p: PedidoRiesgoCandidato): RiesgoOperativo {
  return { tipo: tipoRiesgo(p.estadoEntrega), causa: 'embarques', minutosHabiles: null }
}

export function textoRiesgoOperativo(r: RiesgoOperativo): string {
  if (r.tipo === 'sin_reasignar') return 'Sin reasignar · revisar'
  if (r.tipo === 'en_ruta') return 'En ruta · revisar'
  if (r.causa === 'embarques' || r.minutosHabiles === null) return 'Sin asignar · revisar'
  const h = Math.floor(r.minutosHabiles / 60)
  const m = r.minutosHabiles % 60
  const tiempo = h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
  return `Sin gestionar · ${tiempo} hábiles`
}
