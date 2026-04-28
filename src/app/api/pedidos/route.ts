import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { PedidoCreateSchema } from '@/lib/validators'
import { withAdvisoryLock } from '@/lib/locks'
import { getNextNumero } from '@/lib/sequence'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'

async function getPrecios(tx: any, clientePrefAgua?: number | null) {
  const precios = await tx.precioHistorial.findMany({
    orderBy: { vigenteDesde: 'desc' },
    distinct: ['producto'],
  })
  const map: Record<string, number> = {}
  for (const p of precios) {
    map[p.producto] = Number(p.precio)
  }

  const configs = await tx.config.findMany()
  const configMap = Object.fromEntries(configs.map((c: any) => [c.clave, c.valor]))

  return {
    agua: clientePrefAgua || parseFloat(configMap.PRECIO_AGUA) || map.AGUA_GALON || 12000,
    hielo: parseFloat(configMap.PRECIO_HIELO) || map.HIELO_5KG || 5000,
    botellon: parseFloat(configMap.PRECIO_BOTELLON) || map.BOTELLON_FABRICA || 5000,
    bolsaAgua: parseFloat(configMap.PRECIO_BOLSA_AGUA) || map.BOLSA_AGUA || 3000,
    bolsaHielo: parseFloat(configMap.PRECIO_BOLSA_HIELO) || map.BOLSA_HIELO || 3000,
  }
}

function calculateTotal(
  productos: { agua19L?: number; hielo?: number; botellon?: number; bolsaAgua?: number; bolsaHielo?: number } | undefined,
  precios: { agua: number; hielo: number; botellon: number; bolsaAgua: number; bolsaHielo: number }
): number {
  const cAgua = productos?.agua19L || 0
  const cHielo = productos?.hielo || 0
  const cBotellon = productos?.botellon || 0
  const cBolsaAgua = productos?.bolsaAgua || 0
  const cBolsaHielo = productos?.bolsaHielo || 0

  return (
    cAgua * precios.agua +
    cHielo * precios.hielo +
    cBotellon * precios.botellon +
    cBolsaAgua * precios.bolsaAgua +
    cBolsaHielo * precios.bolsaHielo
  )
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const pagination = getPaginationParams(searchParams)

  try {
    const today = new Date().toISOString().split('T')[0]
    const startOfDay = new Date(today + 'T00:00:00.000Z')
    const endOfDay = new Date(today + 'T23:59:59.999Z')

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
    const { clienteId, tipo, productos, obs, fechaEntrega } = parsed.data

    const result = await withAdvisoryLock('PEDIDO', () => prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.findUnique({
        where: { id: clienteId },
      })

      const precios = await getPrecios(tx, cliente?.precioAguaPref ? Number(cliente.precioAguaPref) : null)

      const total = calculateTotal(productos, precios)

      const pagosData = parsed.data.pagos || []
      const totalPagado = pagosData.reduce((sum, p) => sum + p.monto, 0)

      const numero = await getNextNumero(tx, { seqName: 'pedido_numero_seq', model: 'pedido' })

      const pedido = await tx.pedido.create({
        data: {
          numero,
          clienteId,
          tipo: tipo || 'ENVIO',
          estado: 'PENDIENTE',
          cAguaPed: productos?.agua19L || 0,
          cHieloPed: productos?.hielo || 0,
          cBotellonPed: productos?.botellon || 0,
          cBolsaAguaPed: productos?.bolsaAgua || 0,
          cBolsaHieloPed: productos?.bolsaHielo || 0,
          precioAgua: precios.agua,
          precioHielo: precios.hielo,
          precioBotellon: precios.botellon,
          precioBolsaAgua: precios.bolsaAgua,
          precioBolsaHielo: precios.bolsaHielo,
          total,
          saldo: total - totalPagado,
          totalPagado,
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

      // Crear factura automáticamente
      const facturaNum = await getNextNumero(tx, { seqName: 'factura_numero_seq', model: 'factura' })

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

      return { pedido }
    }))

    return NextResponse.json({ success: true, pedido: result.pedido })
  } catch (error) {
    console.error('Error creating pedido:', error)
    return NextResponse.json({ error: 'Error creating pedido' }, { status: 500 })
  }
}