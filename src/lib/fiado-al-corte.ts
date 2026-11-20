/**
 * #796 fase 2 — Fiado «a la fecha de corte», reconstruido desde movimientos fechados (sin migración, sin foto guardada).
 * Función pura: no lee base de datos ni el reloj. Todo en centavos enteros.
 *
 *   exigible(pedido, corte) = max(0, entregado(< corte) − (pagos(< corte) − reversiones(< corte)))
 *
 * donde `entregado` se valora al total que tenía el pedido EN el corte (se deshacen las rebajas y correcciones de precio
 * posteriores) y un pedido anulado o cancelado DESPUÉS del corte sí existía en el corte. Un dato que no se puede ubicar en
 * el tiempo no se inventa: el resultado se marca `aproximado` con su motivo.
 */

export type MotivoAproximado =
  | 'SIN_FECHA_DE_ANULACION'
  | 'AJUSTE_DE_CANTIDAD_NO_SOPORTADO'
  | 'ENTREGA_PARCIAL_VALORADA_AL_REGISTRARSE'

export interface CambioDeTotal {
  /** Cuándo se aplicó el cambio (rebaja comercial, corrección de precio). */
  fecha: Date
  antesCentavos: number
  despuesCentavos: number
}

export interface HechoDeEntrega {
  entregadoAt: Date
  valorCentavos: number
}

export interface MovimientoDeDinero {
  fecha: Date
  centavos: number
}

export interface PedidoParaFiadoAlCorte {
  id: string
  creadoAt: Date
  /** Total ACTUAL del pedido. */
  totalCentavos: number
  estadoEntrega: string
  entregadoAt: Date | null
  /** Fecha de anulación o cancelación, si el pedido está anulado o cancelado y se pudo ubicar. */
  anuladoAt: Date | null
  cambiosDeTotal: readonly CambioDeTotal[]
  /** `EntregaExigible`: entregas parciales o por evento (existen desde el 6-nov-2026). */
  hechosDeEntrega: readonly HechoDeEntrega[]
  pagos: readonly MovimientoDeDinero[]
  /** Reversiones de dinero (`ReceivableEntry REVERSION`), en positivo. */
  reversiones: readonly MovimientoDeDinero[]
  /** Hay ajustes de cantidad (no soportados aún por la reconstrucción). */
  tieneAjusteDeCantidad?: boolean
}

export interface FiadoDePedidoAlCorte {
  pedidoId: string
  /** El pedido ya existía y no estaba anulado o cancelado en el corte. */
  existia: boolean
  totalAlCorteCentavos: number
  entregadoCentavos: number
  pagadoNetoCentavos: number
  exigibleCentavos: number
  aproximado: boolean
  motivosAproximado: MotivoAproximado[]
}

const sumar = (items: readonly MovimientoDeDinero[], antes: number): number =>
  items.reduce((s, m) => s + (m.fecha.getTime() < antes ? m.centavos : 0), 0)

/** Total del pedido tal como era en el corte: se deshacen los cambios aplicados en o después del corte. */
export function totalAlCorte(p: Pick<PedidoParaFiadoAlCorte, 'totalCentavos' | 'cambiosDeTotal'>, corte: Date): number {
  const t = corte.getTime()
  const posteriores = [...p.cambiosDeTotal].filter(c => c.fecha.getTime() >= t).sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
  return posteriores.length ? posteriores[0].antesCentavos : p.totalCentavos
}

export function calcularFiadoAlCorte(p: PedidoParaFiadoAlCorte, corte: Date): FiadoDePedidoAlCorte {
  const t = corte.getTime()
  const motivos: MotivoAproximado[] = []
  const vacio = (existia: boolean): FiadoDePedidoAlCorte => ({ pedidoId: p.id, existia, totalAlCorteCentavos: 0, entregadoCentavos: 0,
    pagadoNetoCentavos: 0, exigibleCentavos: 0, aproximado: motivos.length > 0, motivosAproximado: motivos })

  if (p.creadoAt.getTime() >= t) return vacio(false)
  const anulado = p.estadoEntrega === 'ANULADO' || p.estadoEntrega === 'CANCELADO'
  if (anulado) {
    if (p.anuladoAt === null) { motivos.push('SIN_FECHA_DE_ANULACION'); return vacio(false) }
    if (p.anuladoAt.getTime() < t) return vacio(false)
  }
  if (p.tieneAjusteDeCantidad) motivos.push('AJUSTE_DE_CANTIDAD_NO_SOPORTADO')

  const total = totalAlCorte(p, corte)
  let entregado = 0
  if (p.hechosDeEntrega.length > 0) {
    entregado = Math.min(total, p.hechosDeEntrega.reduce((s, h) => s + (h.entregadoAt.getTime() < t ? h.valorCentavos : 0), 0))
    if (p.cambiosDeTotal.length > 0) motivos.push('ENTREGA_PARCIAL_VALORADA_AL_REGISTRARSE')
  } else if (p.entregadoAt !== null && (p.estadoEntrega === 'ENTREGADO' || anulado) && p.entregadoAt.getTime() < t) {
    entregado = total
  }

  const pagadoNeto = sumar(p.pagos, t) - sumar(p.reversiones, t)
  return {
    pedidoId: p.id, existia: true, totalAlCorteCentavos: total, entregadoCentavos: entregado, pagadoNetoCentavos: pagadoNeto,
    exigibleCentavos: Math.max(0, entregado - pagadoNeto), aproximado: motivos.length > 0, motivosAproximado: motivos,
  }
}

/** Fin del día calendario de Bogotá (decisión del PO): el instante en que empieza el día siguiente. Colombia no tiene horario de verano. */
export function corteFinDelDiaBogota(dia: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error('DIA_INVALIDO')
  const siguiente = new Date(`${dia}T00:00:00Z`)
  if (Number.isNaN(siguiente.getTime()) || siguiente.toISOString().slice(0, 10) !== dia) throw new Error('DIA_INVALIDO')
  siguiente.setUTCDate(siguiente.getUTCDate() + 1)
  return new Date(`${siguiente.toISOString().slice(0, 10)}T00:00:00-05:00`)
}
