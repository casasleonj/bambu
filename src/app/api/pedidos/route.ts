import { formatZodError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { PedidoCreateSchema } from '@/lib/validators'
import { withAdvisoryLock } from '@/lib/locks'
import { getNextNumero } from '@/lib/sequence'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { getTodayRange } from '@/lib/dates'
import { resolverPreciosPedido, type Canal, type ProductCode } from '@/lib/pricing'
import { logAudit } from '@/lib/audit'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const pagination = getPaginationParams(searchParams)

  try {
    const { startOfDay, endOfDay } = getTodayRange()

    const where = pagination.all
      ? {}
      : {
          fecha: {
            gte: startOfDay,
            lt: endOfDay,
          },
        }

    const prismaPagination = getPrismaPagination(pagination)

    const [pedidosRaw, total] = await Promise.all([
      prisma.pedido.findMany({
        where,
        orderBy: { numero: 'desc' },
        include: { cliente: true },
        ...prismaPagination,
      }),
      prisma.pedido.count({ where }),
    ])

    // Aplanar datos del cliente para el frontend
    const pedidos = pedidosRaw.map(p => ({
      ...p,
      nombreCli: p.cliente?.nombre || 'Desconocido',
      telefonoCli: p.cliente?.telefono || '',
      zonaCli: p.cliente?.direccion || '',
      fecha: p.fecha.toISOString(),
    }))

    return NextResponse.json(
      pagination.all
        ? { pedidos, total }
        : buildPaginationResponse(pedidos, total, pagination.page!, pagination.pageSize!)
    )
  } catch (error) {
    console.error('Error fetching pedidos:', error instanceof Error ? error.message : 'Unknown')
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
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
    }
    const { clienteId: rawClienteId, productos, obs, fechaEntrega, canal, preciosManuales, clienteNuevo } = parsed.data

    const pagosData = parsed.data.pagos || []
    const totalPagado = pagosData.reduce((sum, p) => sum + p.monto, 0)
    const canalReal = (canal || 'DOMICILIO') as Canal
    const tipo = canalReal === 'PUNTO' ? 'PUNTO' : 'ENVIO'

    const result = await withAdvisoryLock('PEDIDO', async (tx) => {
      // Crear cliente nuevo si se proporciona
      let clienteId = rawClienteId
      if (clienteNuevo) {
        const nuevo = await tx.cliente.create({
          data: {
            nombre: clienteNuevo.nombre,
            telefono: clienteNuevo.telefono,
            direccion: clienteNuevo.direccion || '',
            barrio: clienteNuevo.barrio,
            frecuencia: 'NINGUNA',
          },
        })
        clienteId = nuevo.id
      }

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

      // Resolve prices using pricing engine (inside transaction for consistency)
      const preciosResueltos = await resolverPreciosPedido(
        items,
        canalReal,
        clienteId,
        tx,
      )

      // Build price map from resolved prices
      const precioMap: Record<string, number> = {}
      for (const pr of preciosResueltos) {
        precioMap[pr.codigo] = pr.precio
      }

      const total = preciosResueltos.reduce((sum, pr) => sum + pr.subtotal, 0)

      // Estado de ENTREGA, no de pago.
      // ventaRapida = producto ya se entregó (punto o envío inmediato)
      // Pedido normal = aún no se entrega, progresa por embarque
      const estadoInicial = parsed.data.ventaRapida ? 'ENTREGADO' : 'PENDIENTE'

      const pedido = await tx.pedido.create({
        data: {
          clienteId,
          createdById: authResult.user?.id,
          tipo,
          canal: canalReal,
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
          saldo: total - totalPagado,
          totalPagado: totalPagado,
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
      const facturaNum = await getNextNumero(tx, { model: 'factura', field: 'numero' })

      await tx.factura.create({
        data: {
          numero: `FAC-${facturaNum.toString().padStart(5, '0')}`,
          clienteId,
          pedidoId: pedido.id,
          subtotal: total,
          total,
          saldo: total - totalPagado,
        },
      })

      return { pedido, clienteId }
    })

    await logAudit({
      entidad: 'Pedido',
      registroId: result.pedido.id,
      accion: 'CREATE',
      datos: { numero: result.pedido.numero, tipo: result.pedido.tipo, total: Number(result.pedido.total), clienteId: result.clienteId },
      usuarioId: authResult.user?.id,
    })

    return NextResponse.json({ success: true, pedido: result.pedido }, { status: 201 })
  } catch (error) {
    console.error('Error creating pedido:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Error creating pedido' }, { status: 500 })
  }
}
