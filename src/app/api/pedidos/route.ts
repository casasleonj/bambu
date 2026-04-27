import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { PedidoCreateSchema } from '@/lib/validators'

function calculateTotal(
  productos: { agua19L?: number; hielo?: number; botellon?: number; bolsaAgua?: number; bolsaHielo?: number } | undefined,
  precioAgua: number,
  precioHielo: number
): number {
  const cAgua = productos?.agua19L || 0
  const cHielo = productos?.hielo || 0
  const cBotellon = productos?.botellon || 0
  const cBolsaAgua = productos?.bolsaAgua || 0
  const cBolsaHielo = productos?.bolsaHielo || 0

  return (
    cAgua * precioAgua +
    cHielo * precioHielo +
    cBotellon * 5000 +
    cBolsaAgua * 5000 +
    cBolsaHielo * 5000
  )
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const all = searchParams.get('all') === 'true'

  try {
    const pedidos = await prisma.pedido.findMany({
      where: all
        ? { estado: { not: 'CANCELADO' } }
        : {
            fecha: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
              lt: new Date(new Date().setHours(23, 59, 59, 999)),
            },
          },
      orderBy: { numero: 'desc' },
      include: {
        cliente: true,
      },
    })

    return NextResponse.json({ pedidos })
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

    const result = await prisma.$transaction(async (tx) => {
      // Obtener cliente para precio preferencial
      const cliente = await tx.cliente.findUnique({
        where: { id: clienteId },
      })

      // Obtener config de precios
      const precioAgua = cliente?.precioAguaPref || 12000
      const configs = await tx.config.findMany()
      const configMap = Object.fromEntries(configs.map(c => [c.clave, c.valor]))
      const precioHielo = parseFloat(configMap.PRECIO_HIELO) || 5000

      // Calcular total con precios del cliente
      const total = calculateTotal(productos, precioAgua, precioHielo)

      // Procesar pagos
      const pagosData = parsed.data.pagos || []
      const totalPagado = pagosData.reduce((sum, p) => sum + p.monto, 0)

      // Obtener siguiente número secuencial
      const [{ nextval: pedidoNext }] = await tx.$queryRaw<{ nextval: bigint }[]>`
        SELECT nextval('pedido_numero_seq')
      `
      const numero = Number(pedidoNext)

      // Crear pedido
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
          precioAgua,
          precioHielo,
          precioBotellon: 5000,
          precioBolsaAgua: 5000,
          precioBolsaHielo: 5000,
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
      const [{ nextval: facturaNext }] = await tx.$queryRaw<{ nextval: bigint }[]>`
        SELECT nextval('factura_numero_seq')
      `
      const facturaNum = Number(facturaNext)

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
    })

    return NextResponse.json({ success: true, pedido: result.pedido })
  } catch (error) {
    console.error('Error creating pedido:', error)
    return NextResponse.json({ error: 'Error creating pedido' }, { status: 500 })
  }
}