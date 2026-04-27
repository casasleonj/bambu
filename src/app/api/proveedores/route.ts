import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const proveedores = await prisma.proveedor.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    })
    return NextResponse.json({ proveedores })
  } catch (error) {
    return NextResponse.json({ error: 'Error fetching proveedores' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const proveedor = await prisma.proveedor.create({
      data: {
        nombre: body.nombre,
        telefono: body.telefono,
        email: body.email,
        direccion: body.direccion,
      },
    })
    return NextResponse.json({ success: true, proveedor })
  } catch (error) {
    return NextResponse.json({ error: 'Error creating proveedor' }, { status: 500 })
  }
}