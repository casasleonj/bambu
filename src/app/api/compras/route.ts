import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { CompraCreateSchema } from '@/lib/validators'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const compras = await prisma.compraInsumo.findMany({
      orderBy: { fecha: 'desc' },
      include: { insumo: true, proveedor: true },
    })
    return NextResponse.json({ compras })
  } catch (error) {
    console.error('Error fetching compras:', error)
    return NextResponse.json({ error: 'Error fetching compras' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const body = await request.json()
    const parsed = CompraCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const { insumoId, proveedorId, cantidad, montoTotal } = parsed.data

    const insumo = await prisma.insumo.findUnique({ where: { id: insumoId } })
    if (!insumo) {
      return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 })
    }

    // Crear compra
    const lastCompra = await prisma.compraInsumo.findFirst({ orderBy: { numero: 'desc' } })
    const nextNum = lastCompra ? parseInt(lastCompra.numero.replace('COM-', '')) + 1 : 1

    await prisma.compraInsumo.create({
      data: {
        numero: `COM-${nextNum.toString().padStart(5, '0')}`,
        insumoId,
        proveedorId,
        cantidad,
        montoTotal,

      },
    })

    // Actualizar stock
    await prisma.insumo.update({
      where: { id: insumoId },
      data: { stock: { increment: cantidad } },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error creating compra:', error)
    return NextResponse.json({ error: 'Error creating compra' }, { status: 500 })
  }
}