import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const pendiente = searchParams.get('pendiente') === 'true'

  try {
    const facturas = await prisma.factura.findMany({
      where: pendiente ? { saldo: { gt: 0 } } : undefined,
      orderBy: { fecha: 'desc' },
      include: {
        cliente: true,
        abonos: true,
      },
    })

    return NextResponse.json({ facturas })
  } catch (error) {
    console.error('Error fetching facturas:', error)
    return NextResponse.json({ error: 'Error fetching facturas' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { pedidoId, clienteId } = body

    // Verificar que el pedido existe
    const pedido = await prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: { cliente: true },
    })

    if (!pedido) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }

    // Calcular siguiente número
    const lastFactura = await prisma.factura.findFirst({
      orderBy: { numero: 'desc' },
    })
    const nextNum = lastFactura
      ? parseInt(lastFactura.numero.replace('FAC-', '')) + 1
      : 1

    // Crear factura
    const factura = await prisma.factura.create({
      data: {
        numero: `FAC-${nextNum.toString().padStart(5, '0')}`,
        clienteId,
        pedidoId,
        subtotal: pedido.total,
        total: pedido.total,
        saldo: pedido.total,
      },
    })

    return NextResponse.json({ success: true, factura })
  } catch (error) {
    console.error('Error creating factura:', error)
    return NextResponse.json({ error: 'Error creating factura' }, { status: 500 })
  }
}