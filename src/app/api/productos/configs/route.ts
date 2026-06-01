import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requirePermission } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const permCheck = await requirePermission('view:productos', authResult)
  if (permCheck instanceof Response) return permCheck

  try {
    const productos = await prisma.producto.findMany({
      where: { activo: true },
      select: {
        codigo: true,
        nombre: true,
        aplicaDomicilio: true,
        sobreCostoDomicilio: true,
        precioBase: true,
      },
      orderBy: { codigo: 'asc' },
    })

    return apiSuccess({ productos })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching product configs:')
    return apiError('Error cargando configs de productos')
  }
}
