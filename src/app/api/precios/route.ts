import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { z } from 'zod'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'

const PrecioVolumenCreateSchema = z.object({
  productoId: z.string().min(1),
  cantMin: z.coerce.number().int().min(1),
  cantMax: z.coerce.number().int().min(1).nullable().optional(),
  precio: z.coerce.number().positive(),
})

const PrecioVolumenUpdateSchema = z.object({
  precioVolumenId: z.string().min(1),
  precio: z.coerce.number().positive(),
})

const PrecioHistorialSchema = z.object({
  producto: z.string().min(1),
  precio: z.coerce.number().positive(),
})

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const precios = await prisma.precioHistorial.findMany({
      orderBy: { vigenteDesde: 'desc' },
      distinct: ['producto'],
    })

    return apiSuccess({ precios })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching precios:')
    return apiError('Error cargando precios')
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json()

    // Create new volume tier
    const createParsed = PrecioVolumenCreateSchema.safeParse(body)
    if (createParsed.success) {
      const { productoId, cantMin, cantMax, precio } = createParsed.data
      const tier = await prisma.precioVolumen.create({
        data: { productoId, cantMin, cantMax: cantMax ?? null, precio },
      })
      logAudit({
        entidad: 'PrecioVolumen',
        registroId: tier.id,
        accion: 'CREATE',
        datos: { productoId, cantMin, cantMax, precio },
        usuarioId: (authResult.user as { id?: string } | undefined)?.id,
      }).catch(() => {})
      return apiSuccess({ tier }, 201)
    }

    // Update existing volume tier price
    const updateParsed = PrecioVolumenUpdateSchema.safeParse(body)
    if (updateParsed.success) {
      const { precioVolumenId, precio } = updateParsed.data
      await prisma.precioVolumen.update({
        where: { id: precioVolumenId },
        data: { precio },
      })
      logAudit({
        entidad: 'PrecioVolumen',
        registroId: precioVolumenId,
        accion: 'UPDATE',
        datos: { precio },
        usuarioId: (authResult.user as { id?: string } | undefined)?.id,
      }).catch(() => {})
      return apiSuccess({})
    }

    // Create price history entry
    const historialParsed = PrecioHistorialSchema.safeParse(body)
    if (historialParsed.success) {
      const { producto, precio } = historialParsed.data
      const record = await prisma.precioHistorial.create({
        data: {
          producto,
          precio,
          creadoPor: authResult.user?.email || 'unknown',
        },
      })
      logAudit({
        entidad: 'PrecioVolumen',
        registroId: record.id,
        accion: 'CREATE',
        datos: { codigo: record.producto, precio: record.precio },
        usuarioId: (authResult.user as { id?: string } | undefined)?.id,
      }).catch(() => {})
      return apiSuccess({ precio: record }, 201)
    }

    return apiError('Datos invalidos. Envie {productoId, cantMin, cantMax, precio} o {precioVolumenId, precio} o {producto, precio}.', 400)
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error updating precio:')
    return apiError('Error actualizando precio')
  }
}
