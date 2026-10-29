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
    (p) => p.estadoEntrega !== 'ANULADO' && p.estadoEntrega !== 'CANCELADO',
  )
}

/**
 * Calculate total sales: only ENTREGADO pedidos count as sold.
 * Pending / en ruta / no entregado orders are not revenue yet (and ANULADO /
 * CANCELADO never are), so they must not inflate the day's totals.
 */
export function calcularVentas(pedidos: PedidoRaw[]): number {
  return (
    pedidos
      .filter((p) => p.estadoEntrega === 'ENTREGADO')
      .reduce((acc, p) => acc + Math.round(Number(p.total) * 100), 0) / 100
  )
}

/**
 * Calculate pending (fiado) amounts.
 */
export function calcularFiados(pedidos: PedidoRaw[]): number {
  return (
    pedidos
      .filter((p) => Number(p.saldo) > 0 && p.estadoEntrega === 'ENTREGADO')
      .reduce((acc, p) => acc + Math.round(Number(p.saldo) * 100), 0) / 100
  )
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
    if (pedido.estadoEntrega !== 'ENTREGADO') continue
    if (!pedido.items) continue
    const canal: 'PUNTO' | 'DOMICILIO' =
      pedido.canal === 'PUNTO' ? 'PUNTO' : 'DOMICILIO'
    for (const item of pedido.items) {
      const key = `${item.producto}-${Number(item.precio)}-${canal}`
      const existing = map.get(key)
      if (existing) {
        existing.cantidad += item.cantEntrega
        existing.subtotal =
          (Math.round(existing.subtotal * 100) +
            item.cantEntrega * Math.round(Number(item.precio) * 100)) /
          100
      } else {
        map.set(key, {
          producto: item.producto as ProductCode,
          canal,
          precio: Number(item.precio),
          cantidad: item.cantEntrega,
          subtotal:
            (item.cantEntrega * Math.round(Number(item.precio) * 100)) / 100,
        })
      }
    }
  }

  return Array.from(map.values()).sort(
    (a, b) =>
      b.subtotal - a.subtotal ||
      a.producto.localeCompare(b.producto) ||
      a.canal.localeCompare(b.canal),
  )
}

/**
 * Calculate sold quantities by product type from delivered pedidos.
 */
export function calcularVendidos(pedidos: PedidoRaw[]): {
  agua: number
  hielo: number
  botellon: number
} {
  const entregados = pedidos.filter((p) => p.estadoEntrega === 'ENTREGADO')

  return {
    agua: entregados.reduce((acc, p) => acc + (p.cPacaAguaEnt || 0), 0),
    hielo: entregados.reduce((acc, p) => acc + (p.cPacaHieloEnt || 0), 0),
    botellon: entregados.reduce(
      (acc, p) => acc + (p.cBotellonFabEnt || 0) + (p.cBotellonDomEnt || 0),
      0,
    ),
  }
}
