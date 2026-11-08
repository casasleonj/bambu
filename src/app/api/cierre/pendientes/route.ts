import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getTodayString } from '@/lib/dates'
import { listarDiasPendientes } from '@/lib/cierre-huecos'

/**
 * GET /api/cierre/pendientes — días que se pueden cerrar hoy (#306). Cada uno trae cuántos movimientos tuvo
 * y si es obligatorio (tuvo movimiento: nadie lo puede saltar). Un día omitido sin movimientos aparece como
 * opcional y, si luego recibe movimientos, vuelve a aparecer como obligatorio aunque ya exista un cierre posterior.
 */
export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const hoy = getTodayString()
    const dias = await prisma.$transaction((tx) => listarDiasPendientes(tx, hoy))
    return apiSuccess({ hoy, dias })
  } catch (error) {
    console.error('[cierre/pendientes] GET failed:', error)
    return apiError('Error interno del servidor', 500)
  }
}
