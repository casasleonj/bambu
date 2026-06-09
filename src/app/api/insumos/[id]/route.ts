import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { InsumoUpdateSchema } from '@/lib/validators'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { ROLES } from '@/lib/constants'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params
  try {
    const insumo = await prisma.insumo.findUnique({
      where: { id },
      include: { proveedor: true },
    })
    if (!insumo) return apiError('Insumo no encontrado', 404)
    return apiSuccess({ insumo })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching insumo:')
    return apiError('Error cargando insumo')
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    const body = await request.json()
    const parsed = InsumoUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }

    // FIX F-34b: optimistic locking con updatedAt.
    // Antes: prisma.insumo.update directo. Dos admins editando
    // el mismo insumo casi simultáneo, last-write-wins
    // silencioso.
    //
    // Ahora: prisma.$transaction con row lock + updateMany con
    // condición sobre updatedAt. Si el row fue modificado,
    // count=0 → 409 con mensaje específico.
    const insumo = await prisma.$transaction(async (tx) => {
      const existing = await tx.insumo.findUnique({
        where: { id },
        select: { updatedAt: true },
      })
      if (!existing) throw new Error('INSUMO_NOT_FOUND')

      const updateResult = await tx.insumo.updateMany({
        where: { id, updatedAt: existing.updatedAt },
        data: parsed.data,
      })
      if (updateResult.count === 0) {
        throw new Error('INSUMO_MODIFICADO_POR_OTRO_ADMIN')
      }

      return tx.insumo.findUnique({ where: { id } })
    })

    if (!insumo) throw new Error('INSUMO_NOT_FOUND')

    logAudit({
      entidad: 'Insumo',
      registroId: insumo.id,
      accion: 'UPDATE',
      datos: { nombre: insumo.nombre },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({ insumo })
  } catch (error) {
    // FIX F-34b: mapear errores thrown desde la tx
    if (error instanceof Error) {
      if (error.message === 'INSUMO_NOT_FOUND') {
        return apiError('Insumo no encontrado', 404)
      }
      if (error.message === 'INSUMO_MODIFICADO_POR_OTRO_ADMIN') {
        return apiError('El insumo fue modificado por otro admin. Recarga y vuelve a intentar.', 409)
      }
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error updating insumo:')
    return apiError('Error actualizando insumo')
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    await prisma.insumo.update({
      where: { id },
      data: { activo: false },
    })

    logAudit({
      entidad: 'Insumo',
      registroId: id,
      accion: 'DELETE',
      datos: { activo: false },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({})
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error deleting insumo:')
    return apiError('Error eliminando insumo')
  }
}
