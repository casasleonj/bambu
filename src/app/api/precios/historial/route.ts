import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

/**
 * GET /api/precios/historial
 * GET /api/precios/historial?producto=PACA_AGUA
 *
 * Returns full price history (without distinct).
 * If producto query param is provided, filters by that product code.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const url = new URL(request.url)
    const producto = url.searchParams.get('producto')

    const where = producto ? { producto } : {}

    const historial = await prisma.precioHistorial.findMany({
      where,
      orderBy: { vigenteDesde: 'desc' },
    })

    return apiSuccess({ historial })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching precio historial:')
    return apiError('Error cargando historial de precios')
  }
}
