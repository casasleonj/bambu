import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { PedidoCreateSchema } from '@/lib/validators'
import { withAdvisoryLock } from '@/lib/locks'
import { getNextNumero } from '@/lib/sequence'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { getTodayRange } from '@/lib/dates'
import { resolverPreciosPedido, type Canal, type ProductCode } from '@/lib/pricing'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const pagination = getPaginationParams(searchParams)

  try {
    const { startOfDay, endOfDay } = getTodayRange()

    const where = pagination.all
      ? { estado: { not: 'CANCELADO' as any } }
      : {
          fecha: {
            gte: startOfDay,
            lt: endOfDay,
          },
        }

    const prismaPagination = getPrismaPagination(pagination)

    const [pedidos, total] = await Promise.all([
      prisma.pedido.findMany({
        where,
        orderBy: { numero: 'desc' },
        include: { cliente: true },
        ...prismaPagination,
      }),
      prisma.pedido.count({ where }),
    ])

    return NextResponse.json(
      pagination.all
        ? { pedidos, total }
        : buildPaginationResponse(pedidos, total, pagination.page!, pagination.pageSize!)
    )
  } catch (error) {
    console.error('Error fetching pedidos:', error)
    return NextResponse.json({ error: 'Error fetching pedidos' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const body = await request.json()
    const parsed = PedidoCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const { clienteId, productos, obs, fechaEntrega, canal, preciosManuales } = parsed.data

    const isVentaRapida = parsed.data.ventaRapida === true
    const tipo = parsed.data.tipo || (isVentaRapida ? 'MOSTRADOR' : 'ENVIO')
    const estadoInicial = (tipo === 'MOSTRADOR') ? 'ENTREGADO' : 'PENDIENTE'

    const result = await withAdvisoryLock('PEDIDO', () => prisma.$transaction(async (tx) => {
      // Build items array for pricing engine
      const manualPrices = preciosManuales || {}
      const items: Array<{ codigo: ProductCode; cantidad: number; precioManual?: number }> = [
        { codigo: 'PACA_AGUA', cantidad: productos?.pacaAgua || 0, precioManual: manualPrices['PACA_AGUA'] },
        { codigo: 'PACA_HIELO', cantidad: productos?.pacaHielo || 0, precioManual: manualPrices['PACA_HIELO'] },
        { codigo: 'BOTELLON_FAB', cantidad: productos?.botellonFab || 0, precioManual: manualPrices['BOTELLON_FAB'] },
        { codigo: 'BOTELLON_DOM', cantidad: productos?.botellonDom || 0, precioManual: manualPrices['BOTELLON_DOM'] },
        { codigo: 'BOLSA_AGUA', cantidad: productos?.bolsaAgua || 0, precioManual: manualPrices['BOLSA_AGUA'] },
        { codigo: 'BOLSA_HIELO', cantidad: productos?.bolsaHielo || 0, precioManual: manualPrices['BOLSA_HIELO'] },
      ]

      // Resolve prices using pricing engine
      const preciosResueltos = await resolverPreciosPedido(
        items,
        (canal || 'DOMICILIO') as Canal,
        clienteId,
      )

      // Build price map from resolved prices
      const precioMap: Record<string, number> = {}
      for (const pr of preciosResueltos) {
        precioMap[pr.codigo] = pr.precio
      }

      const total = preciosResueltos.reduce((sum, pr) => sum + pr.subtotal, 0)

      const pagosData = parsed.data.pagos || []
      const totalPagado = pagosData.reduce((sum, p) => sum + p.monto, 0)

      const numero = await getNextNumero(tx, { seqName: 'pedido_numero_seq', model: 'pedido' })

      const pedido = await tx.pedido.create({
        data: {
          numero,
          clienteId,
          tipo,
          canal: canal || 'DOMICILIO',
          estado: estadoInicial,
          cPacaAguaPed: productos?.pacaAgua || 0,
          cPacaHieloPed: productos?.pacaHielo || 0,
          cBotellonFabPed: productos?.botellonFab || 0,
          cBotellonDomPed: productos?.botellonDom || 0,
          cBolsaAguaPed: productos?.bolsaAgua || 0,
          cBolsaHieloPed: productos?.bolsaHielo || 0,
          precioPacaAgua: precioMap['PACA_AGUA'] || 0,
          precioPacaHielo: precioMap['PACA_HIELO'] || 0,
          precioBotellonFab: precioMap['BOTELLON_FAB'] || 0,
          precioBotellonDom: precioMap['BOTELLON_DOM'] || 0,
          precioBolsaAgua: precioMap['BOLSA_AGUA'] || 0,
          precioBolsaHielo: precioMap['BOLSA_HIELO'] || 0,
          total,
          saldo: isVentaRapida ? 0 : (total - totalPagado),
          totalPagado: isVentaRapida ? total : totalPagado,
          obs,
          fechaEntrega: fechaEntrega ? new Date(fechaEntrega) : null,
        },
      })

      // Crear pagos
      for (const pago of pagosData) {
        await tx.pago.create({
          data: {
            pedidoId: pedido.id,
            metodo: pago.metodo,
            monto: pago.monto,
          },
        })
      }

      // Crear factura automaticamente
      const facturaNum = await getNextNumero(tx, { seqName: 'factura_numero_seq', model: 'factura' })

      await tx.factura.create({
        data: {
          numero: `FAC-${facturaNum.toString().padStart(5, '0')}`,
          clienteId,
          pedidoId: pedido.id,
          subtotal: total,
          total,
          saldo: isVentaRapida ? 0 : (total - totalPagado),
        },
      })

      return { pedido }
    }))

    return NextResponse.json({ success: true, pedido: result.pedido })
  } catch (error) {
    console.error('Error creating pedido:', error)
    return NextResponse.json({ error: 'Error creating pedido' }, { status: 500 })
  }
}
