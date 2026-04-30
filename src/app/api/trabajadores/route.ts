import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { TrabajadorCreateSchema } from '@/lib/validators'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const { searchParams } = new URL(request.url)
    const rol = searchParams.get('rol')
    const activo = searchParams.get('activo')

    const where: Record<string, unknown> = {}
    if (rol) where.rol = rol
    if (activo !== null) where.activo = activo === 'true'

    const trabajadores = await prisma.trabajador.findMany({
      where,
      orderBy: { nombre: 'asc' },
    })
    return NextResponse.json({ trabajadores })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck
  try {
    const body = await request.json()
    const parsed = TrabajadorCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const trabajador = await prisma.trabajador.create({
      data: {
        nombre: parsed.data.nombre,
        rol: parsed.data.rol,
        tipoPago: parsed.data.tipoPago || 'COMISION',
        usaMoto: parsed.data.usaMoto || false,
        comPacaAgua: parsed.data.comPacaAgua || 200,
        comPacaHielo: parsed.data.comPacaHielo || 200,
        salarioFijo: parsed.data.salarioFijo || 0,
        telefono: parsed.data.telefono,
      },
    })
    return NextResponse.json({ success: true, trabajador }, { status: 201 })
  } catch (error) {
    console.error('Error creating trabajador:', error)
    return NextResponse.json({ error: 'Error creating trabajador' }, { status: 500 })
  }
}
