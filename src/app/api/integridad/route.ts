import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { verificarIntegridad } from '@/lib/integridad/verificar'

/**
 * GET /api/integridad — verificador de integridad (plan v1.2 §5.A, PR-A).
 *
 * Solo ADMIN. Corre las reglas dentro de una transacción READ ONLY y devuelve
 * el reporte; no persiste nada, no notifica y no corrige. Sin cron: se invoca
 * a demanda (o con `scripts/verificar-integridad.ts`).
 */
export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN'], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const reporte = await verificarIntegridad(prisma)
    return apiSuccess({ reporte })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error verificando integridad:')
    return apiError('Error verificando integridad', 500)
  }
}
