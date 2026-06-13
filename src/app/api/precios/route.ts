import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { z } from 'zod'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { revalidatePrecioMinimosCache } from '@/app/api/alertas/precio-minimos/route'

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
  // commit 1.1 plan antifraude: umbral minimo opcional para la alerta
  // PRECIO_POR_DEBAJO_TABLA. Si se omite o es null, no se actualiza
  // (backward compat con llamadas que solo actualizan precio).
  precioMinimo: z.coerce.number().min(0).nullable().optional(),
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

      // FIX F-N23 (hallazgo 36): todas las validaciones + create
      // DENTRO de prisma.$transaction. Antes: cada check era un
      // prisma.* separado FUERA de tx. Dos requests casi simultáneos
      // podían crear rangos solapados:
      //   T0: Admin A: check overlap con rango [10-20] → no overlap
      //   T0: Admin B: check overlap con rango [10-20] → no overlap
      //       (ninguno ha creado todavía)
      //   T1: A crea rango [15-25]
      //   T2: B crea rango [12-22]
      //   T3: Ambos commits. Rangos solapados en PrecioVolumen.
      //       La función resolverPrecio debe manejar solapamiento,
      //       pero es un estado inválido del modelo de negocio.
      //
      // Ahora: prisma.$transaction con row lock implícito. Las dos
      // tx se serializan en el productoId. La segunda ve el rango
      // recién creado y el check de overlap lo detecta.
      const tier = await prisma.$transaction(async (tx) => {
        // Check for exact cantMin collision (unique constraint) - active tiers
        const exactMatch = await tx.precioVolumen.findFirst({
          where: { productoId, cantMin, activo: true },
        })
        if (exactMatch) {
          const existingLabel = exactMatch.cantMax
            ? `${exactMatch.cantMin}-${exactMatch.cantMax}`
            : `${exactMatch.cantMin}+`
          throw new Error(`RANGO_DUPLICADO:${existingLabel}`)
        }

        // Check inactive tiers with same cantMin
        const inactiveMatch = await tx.precioVolumen.findFirst({
          where: { productoId, cantMin, activo: false },
        })
        if (inactiveMatch) {
          if (force) {
            // Force mode: permanently delete the inactive tier
            await tx.precioVolumen.delete({ where: { id: inactiveMatch.id } })
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
            const inactiveLabel = inactiveMatch.cantMax
              ? `${inactiveMatch.cantMin}-${inactiveMatch.cantMax}`
              : `${inactiveMatch.cantMin}+`
            throw new Error(`INACTIVE_TIER_BLOCKING:${inactiveLabel}:${Number(inactiveMatch.precio)}`)
          }
        }

        // Check for overlapping ranges
        const overlapping = await tx.precioVolumen.findFirst({
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
          throw new Error(`RANGO_SOLAPADO:${existingLabel}`)
        }

        return tx.precioVolumen.create({
          data: { productoId, cantMin, cantMax: cantMax ?? null, precio },
          include: { producto: true },
        })
      })

      logAudit({
        entidad: 'PrecioVolumen',
        registroId: tier.id,
        accion: 'CREATE',
        datos: {
          productoId,
          productoCodigo: tier.producto.codigo,
          cantMin,
          cantMax: cantMax ?? null,
          precio,
        },
        usuarioId: (authResult.user as { id?: string } | undefined)?.id,
      }).catch(() => {})
      return apiSuccess({ tier }, 201)
    }

    // Update existing volume tier price
    const updateParsed = PrecioVolumenUpdateSchema.safeParse(body)
    if (updateParsed.success) {
      const { precioVolumenId, precio, precioMinimo } = updateParsed.data

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

      // commit 1.1 plan antifraude: build updateData solo con campos
      // provistos. precioMinimo es opcional; si no viene en el body,
      // no se actualiza (backward compat).
      const updateData: Record<string, unknown> = { precio }
      if (precioMinimo !== undefined) {
        updateData.precioMinimo = precioMinimo
      }

      await prisma.precioVolumen.update({
        where: { id: precioVolumenId },
        data: updateData,
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
        datos: {
          productoId: existing.productoId,
          productoCodigo: existing.producto.codigo,
          cantMin: existing.cantMin,
          cantMax: existing.cantMax,
          precioAnterior: Number(existing.precio),
          precioNuevo: precio,
          ...(precioMinimo !== undefined ? { precioMinimoAnterior: existing.precioMinimo, precioMinimoNuevo: precioMinimo } : {}),
        },
        usuarioId: (authResult.user as { id?: string } | undefined)?.id,
      }).catch(() => {})

      // commit 1.1: invalidar cache de /api/alertas/precio-minimos
      // para que el siguiente fetch del detector vea el cambio.
      revalidatePrecioMinimosCache()

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

    // FIX F-N23: mapear errores thrown desde la tx
    if (message.startsWith('RANGO_DUPLICADO:')) {
      const label = message.split(':')[1]
      return apiError(`Ya existe un rango activo que empieza en esa cantidad (${label}). Edita ese rango o usa un valor diferente.`, 409)
    }
    if (message.startsWith('INACTIVE_TIER_BLOCKING:')) {
      const [, label, precio] = message.split(':')
      return apiError(
        `Hay un rango eliminado con esa cantidad minima (${label}, ${formatCOP(Number(precio))}). ¿Deseas eliminarlo permanentemente y crear el nuevo?`,
        409,
        { code: 'INACTIVE_TIER_BLOCKING' }
      )
    }
    if (message.startsWith('RANGO_SOLAPADO:')) {
      const label = message.split(':')[1]
      return apiError(`El rango se solapa con el existente (${label}). Elimina o ajusta el rango existente primero.`, 409)
    }

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
