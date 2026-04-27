import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const all = searchParams.get('all') === 'true'

  try {
    const pedidos = await prisma.pedido.findMany({
      where: all
        ? { estado: { not: 'ANULADO' } }
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
    const { clienteId, tipo, productos, metodoPago, obs, fechaEntrega } = body

    if (!clienteId) {
      return NextResponse.json({ error: 'Cliente requerido' }, { status: 400 })
    }

    // Obtener cliente para precio preferencial
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
    })

    // Obtener config de precios
    const precioAgua = cliente?.precioAguaPref || 12000
    const configs = await prisma.config.findMany()
    const configMap = Object.fromEntries(configs.map(c => [c.clave, c.valor]))

    // Calcular total con precios del cliente
    const cAgua = productos?.agua19L || 0
    const cHielo = productos?.hielo || 0
    const cBotellon = productos?.botellon || 0
    const cBolsaAgua = productos?.bolsaAgua || 0
    const cBolsaHielo = productos?.bolsaHielo || 0

    const total =
      cAgua * precioAgua +
      cHielo * (parseFloat(configMap.PRECIO_HIELO) || 5000) +
      cBotellon * 5000 +
      cBolsaAgua * 5000 +
      cBolsaHielo * 5000

    // Obtener siguiente número secuencial
    const lastPedido = await prisma.pedido.findFirst({
      orderBy: { numero: 'desc' },
    })
    const nextNum = (lastPedido?.numero || 0) + 1

    // Crear pedido
    const pedido = await prisma.pedido.create({
      data: {
        numero: nextNum,
        clienteId,
        tipo: tipo || 'ENVIO',
        estado: 'PENDIENTE',
        cAguaPed: cAgua,
        cHieloPed: cHielo,
        cBotellonPed: cBotellon,
        cBolsaAguaPed: cBolsaAgua,
        cBolsaHieloPed: cBolsaHielo,
        precioAgua,
        precioHielo: parseFloat(configMap.PRECIO_HIELO) || 5000,
        precioBotellon: 5000,
        precioBolsaAgua: 5000,
        precioBolsaHielo: 5000,
        total,
        saldo: total,
        metodoPago: metodoPago || 'EFECTIVO',
        montoPagado: 0,
        obs,
        fechaEntrega: fechaEntrega ? new Date(fechaEntrega) : null,
      },
    })

    // Crear factura automáticamente
    const lastFactura = await prisma.factura.findFirst({
      orderBy: { numero: 'desc' },
    })
    const facturaNum = lastFactura
      ? parseInt(lastFactura.numero.replace('FAC-', '')) + 1
      : 1

    await prisma.factura.create({
      data: {
        numero: `FAC-${facturaNum.toString().padStart(5, '0')}`,
        clienteId,
        pedidoId: pedido.id,
        subtotal: total,
        total,
        saldo: total,
      },
    })

    return NextResponse.json({ success: true, pedido })
  } catch (error) {
    console.error('Error creating pedido:', error)
    return NextResponse.json({ error: 'Error creating pedido' }, { status: 500 })
  }
}