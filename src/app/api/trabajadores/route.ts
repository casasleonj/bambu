import { formatZodError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { TrabajadorCreateSchema } from '@/lib/validators'
import { apiSuccess, apiError, apiList } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const { searchParams } = new URL(request.url)
    const rol = searchParams.get('rol')
    const activo = searchParams.get('activo')
    const all = searchParams.get('all')

    const where: Record<string, unknown> = {}
    if (rol) where.rol = rol
    if (activo === null) {
      where.activo = true
    } else {
      where.activo = activo === 'true'
    }

    const trabajadores = await prisma.trabajador.findMany({
      where,
      orderBy: { nombre: 'asc' },
    })
    return all === 'true' ? apiSuccess({ trabajadores }) : apiList(trabajadores)
  } catch (error) {
    return apiError('Error cargando trabajadores')
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
      return apiError('Datos invalidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }

    const trabajador = await prisma.trabajador.create({
      data: {
        nombre: parsed.data.nombre,
        rol: parsed.data.rol,
        tipoPago: parsed.data.tipoPago || 'COMISION',
        usaMoto: parsed.data.usaMoto || false,
        capacidadKg: parsed.data.capacidadKg || 500,
        comPacaAgua: parsed.data.comPacaAgua || 200,
        comPacaHielo: parsed.data.comPacaHielo || 200,
        salarioFijo: parsed.data.salarioFijo || 0,
        telefono: parsed.data.telefono,
      },
    })
    return apiSuccess({ trabajador }, 201)
  } catch (error) {
    console.error('Error creating trabajador:', error instanceof Error ? error.message : 'Unknown')
    return apiError('Error creando trabajador')
  }
}
