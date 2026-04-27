import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const conStock = searchParams.get('conStock') === 'true'
  const alertOnly = searchParams.get('alertas') === 'true'

  try {
    let insumos = await prisma.insumo.findMany({
      include: { proveedor: true },
      orderBy: { nombre: 'asc' },
    })

    if (conStock) {
      insumos = insumos.filter(i => i.stock > 0)
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
  try {
    const body = await request.json()
    const { nombre, unidad, stock, stockMin, precioUnit, proveedorId } = body

    const insumo = await prisma.insumo.create({
      data: {
        nombre,
        unidad: unidad || 'UNIDAD',
        stock: parseFloat(stock) || 0,
        stockMin: parseFloat(stockMin) || 0,
        precioUnit: parseFloat(precioUnit) || 0,
        proveedorId: proveedorId || null,
      },
    })

    return NextResponse.json({ success: true, insumo })
  } catch (error) {
    console.error('Error creating insumo:', error)
    return NextResponse.json({ error: 'Error creating insumo' }, { status: 500 })
  }
}