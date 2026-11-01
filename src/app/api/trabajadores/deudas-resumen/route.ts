import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'
import { obtenerDeudasPendientes, type ResumenDeudaTrabajador } from '@/lib/deuda-trabajador-resumen'

/**
 * GET /api/trabajadores/deudas-resumen — total pendiente y cantidad de deudas por trabajador (#566).
 * Solo los trabajadores que deben algo aparecen en `resumen`. ADMIN, ASISTENTE y CONTADOR.
 */
export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const porTrabajador = await obtenerDeudasPendientes(prisma)
    const resumen: Record<string, ResumenDeudaTrabajador> = {}
    for (const [id, d] of porTrabajador) {
      if (d.totalPendiente > 0) resumen[id] = { totalPendiente: d.totalPendiente, cantidad: d.cantidad }
    }
    return apiSuccess({ resumen })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error leyendo el resumen de deudas de trabajadores:')
    return apiError('No se pudo cargar la deuda', 500)
  }
}
