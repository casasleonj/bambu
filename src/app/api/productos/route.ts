import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole, requirePermission } from '@/lib/auth-check'
import { z } from 'zod'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'

export async function GET(_request: NextRequest) {
  // FIX CRITICAL (C-SEC-6a): Only users with view:productos can see prices
  // Previously: requireAuth() only — REPARTIDOR could read all prices
  // (violates BLOQUEAR_PRECIOS_REPARTIDOR=true stated intent)
  const authResult = await requirePermission('view:productos')
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
  precioBase: z.coerce.number().min(0).optional(),
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
    const message = error instanceof Error ? error.message : 'Unknown'
    logger.error({ err: message }, 'Error updating producto:')

    if (message.includes('Record to update not found') || message.includes('P2025')) {
      return apiError('Producto no encontrado', 404)
    }
    if (message.includes('Decimal') || message.includes('overflow')) {
      return apiError('El valor excede el rango permitido', 400)
    }

    const isDev = process.env.NODE_ENV !== 'production'
    return apiError(isDev ? `Error actualizando producto: ${message}` : 'Error actualizando producto', 500)
  }
}
