import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { z } from 'zod'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'

const RutaCreateSchema = z.object({
  nombre: z.string().min(1).max(100),
  dias: z.string().optional(),
  repartidorId: z.string().optional(),
  repartidorRespaldoId: z.string().optional(),
  horarioInicio: z.string().optional(),
  horarioFin: z.string().optional(),
})

const RutaUpdateSchema = RutaCreateSchema.partial()

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const pagination = getPaginationParams(request.nextUrl.searchParams)

  try {
    const where = { activo: true }
    const prismaPagination = getPrismaPagination(pagination)

    const [rutas, total] = await Promise.all([
      prisma.ruta.findMany({
        where,
        orderBy: { nombre: 'asc' },
        include: {
          repartidor: { select: { id: true, nombre: true } },
          repartidorRespaldo: { select: { id: true, nombre: true } },
          _count: { select: { clientes: true, embarques: true } },
        },
        ...prismaPagination,
      }),
      prisma.ruta.count({ where }),
    ])

    return apiSuccess(
      pagination.all
        ? { rutas, total }
        : buildPaginationResponse(rutas, total, pagination.page!, pagination.pageSize!)
    )
  } catch (error) {
    console.error('Error fetching rutas:', error instanceof Error ? error.message : 'Unknown')
    return apiError('Error cargando rutas')
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json()
    const parsed = RutaCreateSchema.safeParse(body)

    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }

    const { nombre, dias, repartidorId, repartidorRespaldoId, horarioInicio, horarioFin } = parsed.data

    const ruta = await prisma.ruta.create({
      data: {
        nombre,
        dias: dias || null,
        repartidorId: repartidorId || null,
        repartidorRespaldoId: repartidorRespaldoId || null,
        horarioInicio: horarioInicio || null,
        horarioFin: horarioFin || null,
        createdById: (authResult.user as { id: string }).id,
      },
      include: {
        repartidor: { select: { id: true, nombre: true } },
        repartidorRespaldo: { select: { id: true, nombre: true } },
      },
    })

    await logAudit({
      entidad: 'Ruta',
      registroId: ruta.id,
      accion: 'CREATE',
      datos: { nombre },
      usuarioId: (authResult.user as { id: string }).id,
    })

    return apiSuccess({ ruta }, 201)
  } catch (error) {
    console.error('Error creating ruta:', error instanceof Error ? error.message : 'Unknown')
    return apiError('Error creando ruta')
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return apiError('ID requerido', 400)
    const parsedId = z.string().min(1).safeParse(id)
    if (!parsedId.success) return apiError('ID formato invalido', 400)

    const body = await request.json()
    const parsed = RutaUpdateSchema.safeParse(body)

    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }

    const ruta = await prisma.ruta.update({
      where: { id },
      data: {
        ...parsed.data,
        repartidorId: parsed.data.repartidorId || null,
        repartidorRespaldoId: parsed.data.repartidorRespaldoId || null,
        horarioInicio: parsed.data.horarioInicio || null,
        horarioFin: parsed.data.horarioFin || null,
      },
      include: {
        repartidor: { select: { id: true, nombre: true } },
        repartidorRespaldo: { select: { id: true, nombre: true } },
      },
    })

    await logAudit({
      entidad: 'Ruta',
      registroId: ruta.id,
      accion: 'UPDATE',
      datos: { nombre: ruta.nombre },
      usuarioId: (authResult.user as { id: string }).id,
    })

    return apiSuccess({ ruta })
  } catch (error) {
    console.error('Error updating ruta:', error instanceof Error ? error.message : 'Unknown')
    return apiError('Error actualizando ruta')
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireRole('ADMIN')
  if (authResult instanceof Response) return authResult

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return apiError('ID requerido', 400)
    }

    const ruta = await prisma.ruta.update({
      where: { id },
      data: { activo: false },
    })

    await logAudit({
      entidad: 'Ruta',
      registroId: ruta.id,
      accion: 'DELETE',
      datos: { nombre: ruta.nombre },
      usuarioId: (authResult.user as { id: string }).id,
    })

    return apiSuccess({ ruta })
  } catch (error) {
    console.error('Error deleting ruta:', error instanceof Error ? error.message : 'Unknown')
    return apiError('Error eliminando ruta')
  }
}
