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

    const updated = await prisma.deudaTrabajador.update({
      where: { id },
      data: updateData,
      include: {
        trabajador: { select: { id: true, nombre: true, rol: true } },
      },
    })

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
