import { formatZodError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { ProveedorCreateSchema } from '@/lib/validators'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
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
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const body = await request.json()
    const parsed = ProveedorCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
    }
    const proveedor = await prisma.proveedor.create({
      data: {
        nombre: parsed.data.nombre,
        telefono: parsed.data.telefono,
        email: parsed.data.email,
        direccion: parsed.data.direccion,
      },
    })
    return NextResponse.json({ success: true, proveedor }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error creating proveedor' }, { status: 500 })
  }
}