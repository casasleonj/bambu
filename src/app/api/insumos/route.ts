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
    let insumos = await prisma.insumo.findMany({
      include: { proveedor: true },
      orderBy: { nombre: 'asc' },
    })

    if (conStock) {
      insumos = insumos.filter(i => Number(i.stock) > 0)
    }
    if (alertOnly) {
      insumos = insumos.filter(i => i.stock <= i.stockMin)
    }

    return NextResponse.json({ insumos })
  } catch (error) {
    console.error('Error fetching insumos:', error)
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

    return NextResponse.json({ success: true, insumo })
  } catch (error) {
    console.error('Error creating insumo:', error)
    return NextResponse.json({ error: 'Error creating insumo' }, { status: 500 })
  }
}