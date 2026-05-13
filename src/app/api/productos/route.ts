import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { z } from 'zod'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const productos = await prisma.producto.findMany({
      where: { activo: true },
      include: {
        precios: {
          where: { activo: true },
          orderBy: { cantMin: 'asc' },
        },
      },
      orderBy: { codigo: 'asc' },
    })

    return apiSuccess({ productos })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching productos:')
    return apiError('Error cargando productos')
  }
}

const ProductoUpdateSchema = z.object({
  aplicaDomicilio: z.boolean().optional(),
  sobreCostoDomicilio: z.coerce.number().min(0).optional(),
})

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json()
    const parsed = z.object({
      productoId: z.string().min(1),
      ...ProductoUpdateSchema.shape,
    }).safeParse(body)

    if (!parsed.success) {
      return apiError('Datos inválidos', 400)
    }

    const { productoId, ...data } = parsed.data
    const producto = await prisma.producto.update({
      where: { id: productoId },
      data,
    })

    logAudit({
      entidad: 'Producto',
      registroId: productoId,
      accion: 'UPDATE',
      datos: data,
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({ producto })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error updating producto:')
    return apiError('Error actualizando producto')
  }
}
