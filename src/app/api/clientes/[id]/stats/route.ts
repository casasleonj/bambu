import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import type { ClienteStats, ProductoFavorito, EvolucionMensual, MetodoPagoStats } from '@/app/(app)/clientes/clientes-client/types'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params

  try {
    const ahora = new Date()
    const hace30 = new Date(ahora)
    hace30.setDate(hace30.getDate() - 30)
    const hace90 = new Date(ahora)
    hace90.setDate(hace90.getDate() - 90)

    const [pedidos, abonosCliente] = await Promise.all([
      prisma.pedido.findMany({
        where: { clienteId: id, estadoEntrega: { not: 'ANULADO' } },
        orderBy: { fecha: 'desc' },
        include: { items: true, pagos: true },
      }),
      prisma.abono.findMany({
        where: { clienteId: id },
        orderBy: { fecha: 'desc' },
      }),
    ])

    const totalComprado = pedidos.reduce((s, p) => s + Number(p.total), 0)
    const totalPagado = pedidos.reduce((s, p) => s + Number(p.totalPagado), 0)
    const totalFiado = pedidos.reduce((s, p) => s + Number(p.saldo), 0)
    const cantidadPedidos = pedidos.length
    const cantidadPedidosUltimos30 = pedidos.filter(p => new Date(p.fecha) >= hace30).length
    const cantidadPedidosUltimos90 = pedidos.filter(p => new Date(p.fecha) >= hace90).length
    const promedioPorPedido = cantidadPedidos > 0 ? totalComprado / cantidadPedidos : 0

    const pedidosEntregados = pedidos
      .filter(p => p.estadoEntrega === 'ENTREGADO')
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
    let frecuenciaRealDias: number | null = null
    if (pedidosEntregados.length >= 2) {
      let dias = 0
      let count = 0
      for (let i = 1; i < pedidosEntregados.length; i++) {
        const diff = (new Date(pedidosEntregados[i].fecha).getTime() - new Date(pedidosEntregados[i - 1].fecha).getTime()) / (1000 * 60 * 60 * 24)
        if (diff > 0 && diff < 90) { dias += diff; count++ }
      }
      if (count > 0) frecuenciaRealDias = Math.round(dias / count)
    }

    const prodMap: Record<string, { cantidadTotal: number; totalVendido: number }> = {}
    for (const p of pedidos) {
      for (const it of p.items || []) {
        if (!prodMap[it.producto]) prodMap[it.producto] = { cantidadTotal: 0, totalVendido: 0 }
        prodMap[it.producto].cantidadTotal += it.cantPedido
        prodMap[it.producto].totalVendido += Number(it.subtotal)
      }
    }
    const productosFavoritos: ProductoFavorito[] = Object.entries(prodMap)
      .map(([nombre, stats]) => ({ nombre, cantidadTotal: stats.cantidadTotal, totalVendido: stats.totalVendido }))
      .sort((a, b) => b.cantidadTotal - a.cantidadTotal)
      .slice(0, 5)

    const evoMap: Record<string, { total: number; pedidos: number }> = {}
    for (let i = 0; i < 24; i++) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      evoMap[key] = { total: 0, pedidos: 0 }
    }
    for (const p of pedidos) {
      const d = new Date(p.fecha)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (evoMap[key]) {
        evoMap[key].total += Number(p.total)
        evoMap[key].pedidos += 1
      }
    }
    const evolucionMensual: EvolucionMensual[] = Object.entries(evoMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, v]) => ({ mes, total: v.total, pedidos: v.pedidos }))

    const metodoMap: Record<string, { count: number; total: number }> = {}
    for (const p of pedidos) {
      for (const pago of p.pagos || []) {
        if (!metodoMap[pago.metodo]) metodoMap[pago.metodo] = { count: 0, total: 0 }
        metodoMap[pago.metodo].count++
        metodoMap[pago.metodo].total += Number(pago.monto)
      }
    }
    for (const a of abonosCliente) {
      if (!metodoMap[a.metodoPago]) metodoMap[a.metodoPago] = { count: 0, total: 0 }
      metodoMap[a.metodoPago].count++
      metodoMap[a.metodoPago].total += Number(a.monto)
    }
    const metodosPago: MetodoPagoStats[] = Object.entries(metodoMap)
      .map(([metodo, v]) => ({ metodo, count: v.count, total: v.total }))
      .sort((a, b) => b.total - a.total)

    let diasPromedioPago: number | null = null
    const pedidosPagados = pedidos.filter(p => Number(p.saldo) === 0 && Number(p.total) > 0 && p.pagos && p.pagos.length > 0)
    if (pedidosPagados.length > 0) {
      let totalDias = 0
      for (const p of pedidosPagados) {
        const fechaPedido = new Date(p.fecha).getTime()
        const ultimoPago = p.pagos!.reduce((max, pg) => Math.max(max, new Date(pg.createdAt).getTime()), fechaPedido)
        totalDias += (ultimoPago - fechaPedido) / (1000 * 60 * 60 * 24)
      }
      diasPromedioPago = Math.round(totalDias / pedidosPagados.length)
    }

    const stats: ClienteStats = {
      totalComprado,
      totalPagado,
      totalFiado,
      cantidadPedidos,
      cantidadPedidosUltimos30,
      cantidadPedidosUltimos90,
      promedioPorPedido,
      frecuenciaRealDias,
      productosFavoritos,
      evolucionMensual,
      metodosPago,
      diasPromedioPago,
    }

    return apiSuccess({ stats: JSON.parse(JSON.stringify(stats)) })
  } catch (error) {
    console.error('[API /clientes/[id]/stats]', error)
    return apiError('Error cargando estadísticas', 500)
  }
}
