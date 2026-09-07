import type { Pedido } from '../pedidos-client/types'
import type { OperacionDerivada, AccionDestacada, DeriveContext, FocoKey } from './types'
import { calcularEstadoPagoVisual } from '@/modules/pedidos/presentation/visual-states'
import { getBadgeOrigen } from '@/modules/pedidos/domain/services/pedido-transitions.service'

function diasDesde(fechaIso: string, hoyBogota: string): number {
  const f = new Date(fechaIso).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const d1 = new Date(f + 'T00:00:00-05:00').getTime()
  const d2 = new Date(hoyBogota + 'T00:00:00-05:00').getTime()
  return Math.max(0, Math.round((d2 - d1) / 86_400_000))
}

const money = (n: number) => new Intl.NumberFormat('es-CO').format(n)

/**
 * Traduce un Pedido al vocabulario de presentación del Hub: estado legible
 * (microcopy, no badges apilados), acción destacada (prioridad contextual) y
 * los focos a los que pertenece (multi-pertenencia). **No** redefine
 * transiciones ni la cascada de estado de pago — las consume
 * (`calcularEstadoPagoVisual`).
 */
export function deriveOperacion(p: Pedido, ctx: DeriveContext): OperacionDerivada {
  const terminal = p.estadoEntrega === 'CANCELADO' || p.estadoEntrega === 'ANULADO'
  if (terminal) {
    return {
      estadoLegible: p.estadoEntrega === 'ANULADO' ? 'Anulado' : 'Cancelado',
      accionDestacada: null,
      focos: [],
    }
  }

  const visual = calcularEstadoPagoVisual({
    estadoPago: p.estadoPago,
    estadoEntrega: p.estadoEntrega,
    saldo: Number(p.saldo),
    total: Number(p.total),
    totalPagado: Number(p.totalPagado),
    pagoReportado: p.pagoReportadoPendiente,
    pagoDiscrepante: p.pagoDiscrepante,
  })

  const saldo = Number(p.saldo)

  const focos: FocoKey[] = []
  if (p.estadoEntrega === 'PENDIENTE' && !p.embarqueId) focos.push('porPlanificar')
  if (p.estadoEntrega === 'EN_RUTA') focos.push('enRuta')
  if (p.estadoEntrega === 'ENTREGADO' && saldo > 0) focos.push('esperandoPago')
  if (ctx.tienePendienteN2) focos.push('pendientesN2')
  if (ctx.tieneExcepcion || p.disputaAbierta || p.pagoDiscrepante) focos.push('excepciones')

  // Acción destacada — prioridad contextual (blueprint §1.3):
  // excepción > cliente bloqueado > pendiente N2 > confirmar pago > registrar pago
  //   > registrar entrega > planificar
  let accionDestacada: AccionDestacada | null = null
  if (focos.includes('excepciones')) {
    accionDestacada = { key: 'resolver-excepcion', label: 'Resolver excepción' }
  } else if (ctx.clienteBloqueado) {
    accionDestacada = { key: 'ver-cartera', label: 'Ver cartera' }
  } else if (ctx.tienePendienteN2) {
    accionDestacada = { key: 'completar-pendiente', label: 'Completar pendiente' }
  } else if (p.estadoEntrega === 'ENTREGADO' && p.pagoReportadoPendiente && saldo === 0) {
    accionDestacada = { key: 'confirmar-pago', label: 'Confirmar pago' }
  } else if (p.estadoEntrega === 'ENTREGADO' && saldo > 0) {
    accionDestacada = { key: 'registrar-pago', label: 'Registrar pago' }
  } else if (p.estadoEntrega === 'EN_RUTA') {
    accionDestacada = { key: 'registrar-entrega', label: 'Registrar entrega' }
  } else if (p.estadoEntrega === 'PENDIENTE') {
    accionDestacada = { key: 'planificar', label: 'Planificar' }
  }

  // Microcopy de estado (blueprint principio 2 — se lee, no se descifra)
  let estadoLegible: string
  if (p.estadoEntrega === 'PENDIENTE') {
    estadoLegible = p.embarqueId ? 'Pendiente · asignado' : 'Pendiente · sin planificar'
  } else if (p.estadoEntrega === 'EN_RUTA') {
    estadoLegible = 'En ruta'
  } else if (p.estadoEntrega === 'NO_ENTREGADO') {
    estadoLegible = 'No entregado'
  } else if (p.estadoEntrega === 'ENTREGADO' && saldo > 0) {
    const d = diasDesde(p.fecha, ctx.hoyBogota)
    estadoLegible = `Entregado · debe $${money(saldo)}${d > 0 ? ` · ${d} día${d === 1 ? '' : 's'}` : ''}`
  } else if (visual.key === 'REPORTADO') {
    estadoLegible = 'Entregado · pago sin confirmar'
  } else if (visual.key === 'DISCREPANTE') {
    estadoLegible = 'Entregado · pago discrepante'
  } else if (visual.label === 'Anticipado') {
    estadoLegible = 'Pagado por anticipado'
  } else {
    estadoLegible = 'Entregado · pagado'
  }

  return { estadoLegible, accionDestacada, focos }
}

/** Etiqueta corta del origen para el chip discreto (solo si ≠ PEDIDO). */
export function origenLabel(origen: string): string | null {
  if (origen === 'PEDIDO') return null
  try {
    return getBadgeOrigen(origen as Parameters<typeof getBadgeOrigen>[0]).label
  } catch {
    return origen.replace(/_/g, ' ')
  }
}
