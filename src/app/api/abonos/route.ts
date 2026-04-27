import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const facturaId = searchParams.get('facturaId')

  try {
    const abonos = await prisma.abono.findMany({
      where: facturaId ? { facturaId } : undefined,
      orderBy: { fecha: 'desc' },
      include: {
        cliente: true,
      },
    })

    return NextResponse.json({ abonos })
  } catch (error) {
    console.error('Error fetching abonos:', error)
    return NextResponse.json({ error: 'Error fetching abonos' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const body = await request.json()
    const { facturaId, clienteId, monto, metodoPago } = body

    // Verificar que la factura existe
    const factura = await prisma.factura.findUnique({
      where: { id: facturaId },
    })

    if (!factura) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    // Calcular siguiente número
    const lastAbono = await prisma.abono.findFirst({
      orderBy: { numero: 'desc' },
    })
    const nextNum = lastAbono ? parseInt(lastAbono.numero.replace('ABO-', '')) + 1 : 1

    // Crear abono
    const abono = await prisma.abono.create({
      data: {
        numero: `ABO-${nextNum.toString().padStart(5, '0')}`,
        facturaId,
        clienteId,
        monto,
        metodoPago,
      },
    })

    // Actualizar montoPagado y saldo de la factura
    const nuevoPagado = factura.montoPagado + monto
    const nuevoSaldo = Math.max(0, factura.total - nuevoPagado)
    const nuevoEstado = nuevoSaldo === 0 ? 'PAGADA' : 'EMITIDA'

    await prisma.factura.update({
      where: { id: facturaId },
      data: {
        montoPagado: nuevoPagado,
        saldo: nuevoSaldo,
        estado: nuevoEstado,
      },
    })

    return NextResponse.json({ success: true, abono })
  } catch (error) {
    console.error('Error creating abono:', error)
    return NextResponse.json({ error: 'Error creating abono' }, { status: 500 })
  }
}