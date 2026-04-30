import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { InsumoCreateSchema } from '@/lib/validators'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const conStock = searchParams.get('conStock') === 'true'
  const alertOnly = searchParams.get('alertas') === 'true'

  try {
    const where: any = {}
    if (conStock) {
      where.stock = { gt: 0 }
    }
    if (alertOnly) {
      where.stock = { ...where.stock, lte: prisma.insumo.fields.stockMin }
    }

    const insumos = await prisma.insumo.findMany({
      where,
      include: { proveedor: true },
      orderBy: { nombre: 'asc' },
    })

    return NextResponse.json({ insumos })
  } catch (error) {
    console.error('Error fetching insumos:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Error fetching insumos' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const body = await request.json()
    const parsed = InsumoCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const { nombre, unidad, stock, stockMin, precioUnit, proveedorId } = parsed.data

    const insumo = await prisma.insumo.create({
      data: {
        nombre,
        unidad: unidad || 'UNIDAD',
        stock: stock || 0,
        stockMin: stockMin || 0,
        precioUnit: precioUnit || 0,
        proveedorId: proveedorId || null,
      },
    })

    return NextResponse.json({ success: true, insumo }, { status: 201 })
  } catch (error) {
    console.error('Error creating insumo:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Error creating insumo' }, { status: 500 })
  }
}