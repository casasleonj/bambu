import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { logAudit } from '@/lib/audit'
import { formatZodError } from '@/lib/utils'
import { DeudaUpdateSchema } from '@/lib/validators'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await params

  try {
    const deuda = await prisma.deudaTrabajador.findUnique({
      where: { id },
      include: {
        trabajador: { select: { id: true, nombre: true, rol: true } },
        abonos: { orderBy: { fecha: 'desc' } },
        deducciones: {
          include: {
            nomina: { select: { id: true, fechaInicio: true, fechaFin: true, estado: true, total: true } },
          },
        },
      },
    })

    if (!deuda) return apiError('Deuda no encontrada', 404)

    return apiSuccess({ deuda })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching deuda:')
    return apiError('Error fetching deuda', 500)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const { id } = await params
  const userId = (authResult as { user?: { id?: string } })?.user?.id

  try {
    const body = await request.json()
    const parsed = DeudaUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    // FIX F-N16 (hallazgo 18): optimistic locking con updatedAt.
    // Antes: read+validate+update SIN tx. Dos PATCH simultáneos
    // podían:
    //   T0: PATCH A lee deuda con updatedAt=T0, montoPendiente=100k
    //   T0: PATCH B lee deuda con updatedAt=T0, montoPendiente=100k
    //       (mismo resultado, ambos leen antes de que cualquiera
    //       commitee)
    //   T1: PATCH A hace update con montoPendiente=50k
    //   T1: PATCH B hace update con montoPendiente=80k
    //   T2: Estado final: montoPendiente=80k (ganó B, A se perdió).
    //       Sin error, sin audit log, ajuste manual perdido.
    //
    // Ahora: updateMany con condición sobre updatedAt. Si otro PATCH
    // commiteó primero, su update cambió updatedAt, por lo que el
    // where no matchea y count=0. Devolvemos 409.
    const deuda = await prisma.deudaTrabajador.findUnique({ where: { id } })
    if (!deuda) return apiError('Deuda no encontrada', 404)

    const updateData: Record<string, unknown> = {}
    if (parsed.data.montoPendiente !== undefined) {
      // Validate montoPendiente doesn't exceed montoOriginal
      if (parsed.data.montoPendiente > Number(deuda.montoOriginal)) {
        return apiError('El monto pendiente no puede exceder el monto original', 400)
      }
      updateData.montoPendiente = parsed.data.montoPendiente
    }
    if (parsed.data.descripcion !== undefined) {
      updateData.descripcion = parsed.data.descripcion
    }

    // Si no hay campos para actualizar, retornar la deuda actual
    if (Object.keys(updateData).length === 0) {
      return apiSuccess({
        deuda: {
          ...deuda,
          trabajador: { id: '', nombre: '', rol: '' },  // incluye vacío
        },
      })
    }

    // updateMany atómico con condición de updatedAt (optimistic locking).
    // Si el row fue modificado entre el findUnique y el updateMany,
    // count=0 y devolvemos 409 limpio.
    const updateResult = await prisma.deudaTrabajador.updateMany({
      where: {
        id,
        updatedAt: deuda.updatedAt,
      },
      data: updateData,
    })

    if (updateResult.count === 0) {
      return apiError(
        'La deuda fue modificada por otro usuario. Recarga y vuelve a intentar.',
        409,
      )
    }

    // Re-leer la deuda actualizada para devolver el estado final
    const updated = await prisma.deudaTrabajador.findUnique({
      where: { id },
      include: {
        trabajador: { select: { id: true, nombre: true, rol: true } },
      },
    })

    if (!updated) return apiError('Deuda no encontrada', 404)  // no debería pasar

    logAudit({
      entidad: 'DeudaTrabajador',
      registroId: id,
      accion: 'UPDATE',
      datos: updateData,
      usuarioId: userId,
    }).catch(() => {})

    return apiSuccess({ deuda: updated })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error updating deuda:')
    return apiError('Error actualizando deuda', 500)
  }
}
