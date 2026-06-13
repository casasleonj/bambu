/**
 * GET /api/alertas/precio-minimos
 *
 * Devuelve la lista flat de precioMinimos (por producto+cantidad) para
 * alimentar el detector de la alerta PRECIO_POR_DEBAJO_TABLA.
 *
 * Solo se incluyen tuplas con precioMinimo !== null. Las tuplas sin
 * restriccion (precioMinimo = null) son "alerta deshabilitada" — el
 * detector las skipea sin error.
 *
 * Auth: requireAuth. Cualquier usuario autenticado puede leer
 * (los umbrales no son info sensible).
 *
 * Cache: 60s (los precios cambian muy rara vez).
 */

import { NextRequest } from 'next/server'
import { revalidateTag, unstable_cache } from 'next/cache'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getPrecioMinimos } from '@/lib/pricing'
import { logger } from '@/lib/logger'

const CACHE_TAG = 'alertas-precio-minimos'
const CACHE_TTL = 60

const cachedGetPrecioMinimos = unstable_cache(
  async () => getPrecioMinimos(),
  ['alertas-precio-minimos-get'],
  { revalidate: CACHE_TTL, tags: [CACHE_TAG] },
)

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const rows = await cachedGetPrecioMinimos()
    return apiSuccess({ rows })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching precio-minimos:')
    return apiError('Error cargando precio-minimos', 500)
  }
}

/**
 * Invalidate cache despues de que el admin actualice precioMinimo
 * via PATCH /api/precios. Llamar desde ese endpoint.
 */
export function revalidatePrecioMinimosCache(): void {
  revalidateTag(CACHE_TAG, 'max')
}
