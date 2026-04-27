import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start')
    const end = searchParams.get('end')

    const dateFilter = {
      gte: start ? new Date(start) : new Date(new Date().setDate(new Date().getDate() - 30)),
      lte: end ? new Date(end) : new Date(),
    }

    const pedidos = await prisma.pedido.findMany({
      where: {
        fecha: dateFilter,
        estado: { not: 'CANCELADO' },
      },
      include: {
        cliente: true,
        pagos: true,
      },
      orderBy: { fecha: 'desc' },
    })

    const resumen = {
      totalPedidos: pedidos.length,
      totalVentas: pedidos.reduce((sum, p) => sum + p.total, 0),
      totalPagado: pedidos.reduce((sum, p) => sum + (p.totalPagado || 0), 0),
      totalFiado: pedidos.reduce((sum, p) => sum + (p.saldo > 0 ? p.saldo : 0), 0),
      porProducto: {
        agua: pedidos.reduce((sum, p) => sum + p.cAguaPed, 0),
        hielo: pedidos.reduce((sum, p) => sum + p.cHieloPed, 0),
        botellon: pedidos.reduce((sum, p) => sum + p.cBotellonPed, 0),
        bolsaAgua: pedidos.reduce((sum, p) => sum + p.cBolsaAguaPed, 0),
        bolsaHielo: pedidos.reduce((sum, p) => sum + p.cBolsaHieloPed, 0),
      },
      porMetodoPago: {} as Record<string, number>,
    }

    // Aggregate payments by method
    for (const pedido of pedidos) {
      for (const pago of pedido.pagos) {
        const metodo = pago.metodo
        resumen.porMetodoPago[metodo] = (resumen.porMetodoPago[metodo] || 0) + Number(pago.monto)
      }
    }

    return NextResponse.json({ pedidos, resumen })
  } catch (error) {
    console.error('Error fetching reporte ventas:', error)
    return NextResponse.json({ error: 'Error fetching reporte' }, { status: 500 })
  }
}
