import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { z } from 'zod'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'

/** Format currency for API messages (COP) */
function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

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
      const force = body.force === true

      // Validate cantMax >= cantMin
      if (cantMax !== undefined && cantMax !== null && cantMax < cantMin) {
        return apiError('La cantidad maxima debe ser mayor o igual a la cantidad minima', 400)
      }

      // Check for exact cantMin collision (unique constraint) - active tiers
      const exactMatch = await prisma.precioVolumen.findFirst({
        where: { productoId, cantMin, activo: true },
      })
      if (exactMatch) {
        const existingLabel = exactMatch.cantMax
          ? `${exactMatch.cantMin}-${exactMatch.cantMax}`
          : `${exactMatch.cantMin}+`
        return apiError(`Ya existe un rango activo que empieza en ${cantMin} (${existingLabel}). Edita ese rango o usa un valor diferente.`, 409)
      }

      // Check inactive tiers with same cantMin (they still block the unique constraint)
      const inactiveMatch = await prisma.precioVolumen.findFirst({
        where: { productoId, cantMin, activo: false },
      })
      if (inactiveMatch) {
        if (force) {
          // Force mode: permanently delete the inactive tier, then create the new one
          await prisma.precioVolumen.delete({ where: { id: inactiveMatch.id } })
          logAudit({
            entidad: 'PrecioVolumen',
            registroId: inactiveMatch.id,
            accion: 'DELETE',
            datos: {
              productoId: inactiveMatch.productoId,
              cantMin: inactiveMatch.cantMin,
              cantMax: inactiveMatch.cantMax,
              precio: Number(inactiveMatch.precio),
              reason: 'replaced_by_new_tier',
              newTierCantMin: cantMin,
              newTierPrecio: precio,
            },
            usuarioId: (authResult.user as { id?: string } | undefined)?.id,
          }).catch(() => {})
        } else {
          // No force: return structured 409 so client can prompt user
          const inactiveLabel = inactiveMatch.cantMax
            ? `${inactiveMatch.cantMin}-${inactiveMatch.cantMax}`
            : `${inactiveMatch.cantMin}+`
          return apiError(
            `Hay un rango eliminado con cantMin=${cantMin} (${inactiveLabel}, ${formatCOP(Number(inactiveMatch.precio))}). ¿Deseas eliminarlo permanentemente y crear el nuevo?`,
            409,
            {
              code: 'INACTIVE_TIER_BLOCKING',
            }
          )
        }
      }

      // Check for overlapping ranges
      const overlapping = await prisma.precioVolumen.findFirst({
        where: {
          productoId,
          activo: true,
          OR: [
            { cantMax: null },
            { cantMax: { gte: cantMin } },
          ],
          cantMin: { lte: cantMax ?? cantMin },
        },
      })
      if (overlapping) {
        const existingLabel = overlapping.cantMax
          ? `${overlapping.cantMin}-${overlapping.cantMax}`
          : `${overlapping.cantMin}+`
        return apiError(`El rango se solapa con el existente (${existingLabel}). Elimina o ajusta el rango existente primero.`, 409)
      }

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

      logger.debug({ precioVolumenId }, 'DEBUG: Intentando buscar PrecioVolumen por ID')

      // Fetch existing tier for history
      let existing = await prisma.precioVolumen.findUnique({
        where: { id: precioVolumenId },
        include: { producto: true },
      })

      // Fallback: si findUnique no encuentra, intentar con findFirst (patron comunitario validado)
      if (!existing) {
        logger.debug({ precioVolumenId }, 'DEBUG: findUnique retorno null, intentando findFirst')
        existing = await prisma.precioVolumen.findFirst({
          where: { id: precioVolumenId },
          include: { producto: true },
        })
      }

      if (!existing) {
        logger.error({ precioVolumenId }, 'DEBUG: findFirst tampoco encontro el registro')
        return apiError('Rango de precio no encontrado', 404)
      }

      await prisma.precioVolumen.update({
        where: { id: precioVolumenId },
        data: { precio },
      })

      // Auto-create price history entry
      await prisma.precioHistorial.create({
        data: {
          producto: existing.producto.codigo,
          precio,
          creadoPor: authResult.user?.email || 'unknown',
        },
      }).catch(() => {})

      logAudit({
        entidad: 'PrecioVolumen',
        registroId: precioVolumenId,
        accion: 'UPDATE',
        datos: { precioAnterior: Number(existing.precio), precioNuevo: precio },
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
    const message = error instanceof Error ? error.message : 'Unknown'
    logger.error({ err: message }, 'Error in precios API:')

    // Detectar errores de Prisma/DB comunes y dar mensajes utiles
    if (message.includes('Record to update not found') || message.includes('P2025')) {
      return apiError('Rango de precio no encontrado', 404)
    }
    if (message.includes('unique constraint') || message.includes('P2002')) {
      // Intentar extraer cantMin del body para mensaje mas claro
      let cantMinInfo = ''
      try {
        const body = JSON.parse((error as { cause?: { body?: string } })?.cause?.body || '{}')
        if (body.cantMin) cantMinInfo = ` (cantidad minima: ${body.cantMin})`
      } catch { /* ignore */ }
      return apiError(`Ya existe un rango con esa cantidad minima${cantMinInfo}. Edita el rango existente o usa un valor diferente.`, 409)
    }
    if (message.includes('Decimal') || message.includes('overflow')) {
      return apiError('El precio excede el rango permitido', 400)
    }

    // En desarrollo, incluir el mensaje real para debugging (sin stack trace)
    const isDev = process.env.NODE_ENV !== 'production'
    const cleanMessage = message.split('\n')[0].trim()
    return apiError(isDev ? `Error en operacion de precios: ${cleanMessage}` : 'Error en operacion de precios', 500)
  }
}
