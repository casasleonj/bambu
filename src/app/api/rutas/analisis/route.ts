import { requireAuth } from '@/lib/auth-check'
import {
  analizarPatronesEntrega,
  obtenerRepartidoresActivos,
  obtenerBarriosSinRuta,
} from '@/lib/route-analysis'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'

const AnalisisSchema = z.object({
  desde: z.string().date().optional(),
  hasta: z.string().date().optional(),
  minEntregas: z.coerce.number().int().positive().optional(),
})

export async function GET(request: Request) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const url = new URL(request.url)
    const validation = AnalisisSchema.safeParse(
      Object.fromEntries(url.searchParams.entries())
    )
    if (!validation.success) {
      return apiError('Parámetros inválidos', 400, validation.error.flatten())
    }
    const [analisis, repartidores, barriosSinRuta] = await Promise.all([
      analizarPatronesEntrega(),
      obtenerRepartidoresActivos(),
      obtenerBarriosSinRuta(),
    ])

    return apiSuccess({
      ...analisis,
      repartidores,
      barriosSinRuta,
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error en análisis de rutas:')
    return apiError('Error al analizar patrones de entrega', 500)
  }
}
