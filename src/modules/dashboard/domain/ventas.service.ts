/**
 * Ventas Domain Service.
 *
 * Pure business logic for sales aggregation and trend calculations.
 * No Prisma, no side effects — just math.
 */

import type { PedidoRaw, VentaPorPrecio } from './types'
import type { ProductCode } from '@/shared/domain'

/**
 * Filter out cancelled/annulled pedidos.
 */
export function pedidosValidos(pedidos: PedidoRaw[]): PedidoRaw[] {
  return pedidos.filter(
    p => p.estadoEntrega !== 'ANULADO' && p.estadoEntrega !== 'CANCELADO'
  )
}

/**
 * Calculate total sales from valid pedidos.
 */
export function calcularVentas(pedidos: PedidoRaw[]): number {
  return pedidos.reduce((acc, p) => acc + Number(p.total), 0)
}

/**
 * Calculate pending (fiado) amounts.
 */
export function calcularFiados(pedidos: PedidoRaw[]): number {
  return pedidos
    .filter(p => Number(p.saldo) > 0 && p.estadoEntrega === 'ENTREGADO')
    .reduce((acc, p) => acc + Number(p.saldo), 0)
}

/**
 * Calculate trend percentage between current and previous value.
 */
export function calcularTrend(actual: number, previous: number): number {
  return previous > 0 ? ((actual - previous) / previous) * 100 : 0
}

/**
 * Aggregate sales by product code and price point.
 */
export function buildVentasPorPrecio(pedidos: PedidoRaw[]): VentaPorPrecio[] {
  const map = new Map<string, VentaPorPrecio>()

  for (const pedido of pedidos) {
    if (!pedido.items) continue
    for (const item of pedido.items) {
      const key = `${item.producto}-${Number(item.precio)}`
      const existing = map.get(key)
      if (existing) {
        existing.cantidad += item.cantEntrega
        existing.subtotal += item.cantEntrega * Number(item.precio)
      } else {
        map.set(key, {
          producto: item.producto as ProductCode,
          precio: Number(item.precio),
          cantidad: item.cantEntrega,
          subtotal: item.cantEntrega * Number(item.precio),
        })
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.subtotal - a.subtotal)
}

/**
 * Calculate sold quantities by product type from delivered pedidos.
 */
export function calcularVendidos(pedidos: PedidoRaw[]): {
  agua: number
  hielo: number
  botellon: number
} {
  const entregados = pedidos.filter(p => p.estadoEntrega === 'ENTREGADO')

  return {
    agua: entregados.reduce((acc, p) => acc + (p.cPacaAguaEnt || 0), 0),
    hielo: entregados.reduce((acc, p) => acc + (p.cPacaHieloEnt || 0), 0),
    botellon: entregados.reduce(
      (acc, p) => acc + (p.cBotellonFabEnt || 0) + (p.cBotellonDomEnt || 0),
      0,
    ),
  }
}
