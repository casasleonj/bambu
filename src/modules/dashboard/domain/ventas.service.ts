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

const ESTADOS_SIN_VENTA = ['ANULADO', 'CANCELADO']

/**
 * Entrega parcial: el pedido NO está ENTREGADO (sigue pendiente/en ruta con
 * lo que falta) pero ya entregó unidades (`cantEntrega > 0`). Esa entrega fue
 * un domicilio exitoso y cuenta como venta por lo realmente entregado.
 * ANULADO / CANCELADO nunca cuentan.
 */
export function esEntregaParcial(p: PedidoRaw): boolean {
  if (p.estadoEntrega === 'ENTREGADO') return false
  if (ESTADOS_SIN_VENTA.includes(p.estadoEntrega)) return false
  return (
    (p.items ?? []).some((i) => i.cantEntrega > 0) ||
    (p.cPacaAguaEnt ?? 0) > 0 ||
    (p.cPacaHieloEnt ?? 0) > 0 ||
    (p.cBotellonFabEnt ?? 0) > 0 ||
    (p.cBotellonDomEnt ?? 0) > 0
  )
}

/** Valor (en centavos) de lo realmente entregado: Σ cantEntrega × precio. */
function valorEntregadoCentavos(p: PedidoRaw): number {
  return (p.items ?? []).reduce(
    (acc, i) => acc + i.cantEntrega * Math.round(Number(i.precio) * 100),
    0,
  )
}

/**
 * Calculate total sales: ENTREGADO pedidos count by their total; partial
 * deliveries count by the value actually delivered. Pending / en ruta orders
 * with nothing delivered are not revenue yet (and ANULADO / CANCELADO never
 * are), so they must not inflate the day's totals.
 */
export function calcularVentas(pedidos: PedidoRaw[]): number {
  return (
    pedidos.reduce((acc, p) => {
      if (p.estadoEntrega === 'ENTREGADO') {
        return acc + Math.round(Number(p.total) * 100)
      }
      if (esEntregaParcial(p)) return acc + valorEntregadoCentavos(p)
      return acc
    }, 0) / 100
  )
}

/**
 * Calculate pending (fiado) amounts.
 */
export function calcularFiados(pedidos: PedidoRaw[]): number {
  return pedidos.reduce((sum, p) => sum + Math.round((p.exigible ?? (p.estadoEntrega === 'ENTREGADO' ? Number(p.saldo) : 0)) * 100), 0) / 100
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
    if (pedido.estadoEntrega !== 'ENTREGADO' && !esEntregaParcial(pedido)) {
      continue
    }
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
 * Calculate sold quantities by product type from delivered (and partially
 * delivered) pedidos.
 */
export function calcularVendidos(pedidos: PedidoRaw[]): {
  agua: number
  hielo: number
  botellon: number
} {
  const entregados = pedidos.filter(
    (p) => p.estadoEntrega === 'ENTREGADO' || esEntregaParcial(p),
  )

  return {
    agua: entregados.reduce((acc, p) => acc + (p.cPacaAguaEnt || 0), 0),
    hielo: entregados.reduce((acc, p) => acc + (p.cPacaHieloEnt || 0), 0),
    botellon: entregados.reduce(
      (acc, p) => acc + (p.cBotellonFabEnt || 0) + (p.cBotellonDomEnt || 0),
      0,
    ),
  }
}
