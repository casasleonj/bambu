/**
 * Franjas Horarias Domain Service.
 *
 * Aggregates pedido counts into 4 time bands instead of 24 hourly bars.
 * Pure business logic — no dependencies.
 */

import type { PedidoRaw, FranjaHoraria } from './types'

const FRANJAS_TEMPLATE: Omit<FranjaHoraria, 'count'>[] = [
  { label: 'Madrugada', range: [0, 5] },
  { label: 'Mañana', range: [6, 11] },
  { label: 'Tarde', range: [12, 17] },
  { label: 'Noche', range: [18, 23] },
]

/**
 * Aggregate pedidos into time bands using Colombia timezone.
 */
export function calcularFranjasHorarias(pedidos: PedidoRaw[]): {
  franjas: FranjaHoraria[]
  maxFranja: number
} {
  const franjas: FranjaHoraria[] = FRANJAS_TEMPLATE.map(f => ({ ...f, count: 0 }))

  for (const pedido of pedidos) {
    const fecha = typeof pedido.fecha === 'string' ? new Date(pedido.fecha) : pedido.fecha
    const hour = parseInt(
      fecha.toLocaleString('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hour12: false }),
      10,
    )
    const franja = franjas.find(f => hour >= f.range[0] && hour <= f.range[1])
    if (franja) franja.count++
  }

  const maxFranja = Math.max(...franjas.map(f => f.count), 1)

  return { franjas, maxFranja }
}
