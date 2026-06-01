import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requirePermission } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

/**
 * GET /api/precios/version
 * 
 * Retorna un timestamp de la última modificación de precios.
 * Usado por polling del cliente para detectar cambios sin recargar toda la tabla.
 * 
 * Query liviano: 2 MAX() en paralelo, sub-milisegundo.
 */
export async function GET(_request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const permCheck = await requirePermission('view:productos', authResult)
  if (permCheck instanceof Response) return permCheck

  try {
    const [productoMax, precioVolumenMax] = await Promise.all([
      prisma.producto.aggregate({
        _max: { updatedAt: true },
      }),
      prisma.precioVolumen.aggregate({
        _max: { updatedAt: true },
      }),
    ])

    const maxProducto = productoMax._max.updatedAt
    const maxPrecioVolumen = precioVolumenMax._max.updatedAt

    // Tomar el más reciente de los dos
    let version: string
    if (maxProducto && maxPrecioVolumen) {
      version = maxProducto > maxPrecioVolumen 
        ? maxProducto.toISOString() 
        : maxPrecioVolumen.toISOString()
    } else if (maxProducto) {
      version = maxProducto.toISOString()
    } else if (maxPrecioVolumen) {
      version = maxPrecioVolumen.toISOString()
    } else {
      version = new Date(0).toISOString() // Fallback si no hay datos
    }

    return apiSuccess({ version })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching price version:')
    return apiError('Error fetching price version', 500)
  }
}
