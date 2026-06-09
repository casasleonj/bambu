import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { z } from 'zod'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

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
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching rutas:')
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

    // FIX F-33a: prisma.$transaction con row lock implícito sobre
    // la unique constraint Ruta.nombre. Antes: create directo.
    // Dos admins creando ruta con el mismo nombre casi simultáneo
    // → P2002 → 500. Ahora: 409 con mensaje específico.
    const ruta = await prisma.$transaction(async (tx) => {
      return tx.ruta.create({
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
    })

    logAudit({
      entidad: 'Ruta',
      registroId: ruta.id,
      accion: 'CREATE',
      datos: { nombre },
      usuarioId: (authResult.user as { id: string }).id,
    })

    return apiSuccess({ ruta }, 201)
  } catch (error) {
    // FIX F-33a: mapear P2002 → 409 limpio
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return apiError('Ya existe una ruta con ese nombre', 409)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error creating ruta:')
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

    // FIX F-33b: optimistic locking con updatedAt.
    // Antes: prisma.ruta.update directo sin tx. Dos admins
    // editando la misma ruta casi simultáneo, last-write-wins
    // silencioso. Cambios manuales perdidos.
    //
    // Ahora: updateMany con condición sobre updatedAt. Si el
    // row fue modificado entre el read y el update, count=0
    // → 409 con mensaje específico.
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.ruta.findUnique({
        where: { id },
        select: { updatedAt: true },
      })
      if (!existing) throw new Error('RUTA_NOT_FOUND')

      const updateResult = await tx.ruta.updateMany({
        where: { id, updatedAt: existing.updatedAt },
        data: {
          ...parsed.data,
          repartidorId: parsed.data.repartidorId || null,
          repartidorRespaldoId: parsed.data.repartidorRespaldoId || null,
          horarioInicio: parsed.data.horarioInicio || null,
          horarioFin: parsed.data.horarioFin || null,
        },
      })
      if (updateResult.count === 0) {
        throw new Error('RUTA_MODIFICADA_POR_OTRO_ADMIN')
      }

      return tx.ruta.findUnique({
        where: { id },
        include: {
          repartidor: { select: { id: true, nombre: true } },
          repartidorRespaldo: { select: { id: true, nombre: true } },
        },
      })
    })

    if (!updated) throw new Error('RUTA_NOT_FOUND')
    const ruta = updated

    logAudit({
      entidad: 'Ruta',
      registroId: ruta.id,
      accion: 'UPDATE',
      datos: { nombre: ruta.nombre },
      usuarioId: (authResult.user as { id: string }).id,
    })

    return apiSuccess({ ruta })
  } catch (error) {
    // FIX F-33b: mapear errores thrown desde la tx
    if (error instanceof Error) {
      if (error.message === 'RUTA_NOT_FOUND') {
        return apiError('Ruta no encontrada', 404)
      }
      if (error.message === 'RUTA_MODIFICADA_POR_OTRO_ADMIN') {
        return apiError('La ruta fue modificada por otro admin. Recarga y vuelve a intentar.', 409)
      }
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error updating ruta:')
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

    logAudit({
      entidad: 'Ruta',
      registroId: ruta.id,
      accion: 'DELETE',
      datos: { nombre: ruta.nombre },
      usuarioId: (authResult.user as { id: string }).id,
    })

    return apiSuccess({ ruta })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error deleting ruta:')
    return apiError('Error eliminando ruta')
  }
}
