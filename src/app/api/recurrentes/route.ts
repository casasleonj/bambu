import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { sanitizarSaltos, calcularProxGeneracion } from '@/lib/recurrentes'
import { z } from 'zod'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'

const RecurrenteCreateSchema = z.object({
  clienteId: z.string().min(1),
  tipo: z.enum(['ENVIO', 'PUNTO']).default('ENVIO'),
  canal: z.enum(['PUNTO', 'DOMICILIO']).default('DOMICILIO'),
  cadaNDias: z.coerce.number().int().min(1).default(7),
  proxGeneracion: z.string().datetime().optional(),
  horaPreferida: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:mm').optional().nullable(),
  productos: z.object({
    pacaAgua: z.coerce.number().int().min(0).optional(),
    pacaHielo: z.coerce.number().int().min(0).optional(),
    botellon: z.coerce.number().int().min(0).optional(),
    bolsaAgua: z.coerce.number().int().min(0).optional(),
    bolsaHielo: z.coerce.number().int().min(0).optional(),
  }).optional(),
  notas: z.string().max(500).optional(),
})

const RecurrenteUpdateSchema = z.object({
  cadaNDias: z.coerce.number().int().min(1).optional(),
  tipo: z.enum(['ENVIO', 'PUNTO']).optional(),
  canal: z.enum(['PUNTO', 'DOMICILIO']).optional(),
  horaPreferida: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:mm').optional().nullable(),
  productos: z.object({
    pacaAgua: z.coerce.number().int().min(0).optional(),
    pacaHielo: z.coerce.number().int().min(0).optional(),
    botellon: z.coerce.number().int().min(0).optional(),
    bolsaAgua: z.coerce.number().int().min(0).optional(),
    bolsaHielo: z.coerce.number().int().min(0).optional(),
  }).optional(),
  saltos: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  notas: z.string().max(500).optional().nullable(),
  activo: z.boolean().optional(),
})

function productosToJson(p: Record<string, number | undefined>): string {
  return JSON.stringify({
    PACA_AGUA: p.pacaAgua ?? 0,
    PACA_HIELO: p.pacaHielo ?? 0,
    BOTELLON: p.botellon ?? 0,
    BOLSA_AGUA: p.bolsaAgua ?? 0,
    BOLSA_HIELO: p.bolsaHielo ?? 0,
  })
}

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const plantillas = await prisma.plantillaRecurrente.findMany({
      where: { activo: true },
      include: {
        cliente: { select: { id: true, nombre: true, telefono: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const recurrentes = plantillas.map(pt => ({
      ...pt,
      productos: JSON.parse(pt.productos),
    }))

    return apiSuccess({ recurrentes })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching recurrentes:')
    return apiError('Error al cargar recurrentes', 500)
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json()
    const parsed = RecurrenteCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const { clienteId, tipo, canal, cadaNDias, proxGeneracion: proxGeneracionInput, horaPreferida, productos, notas } = parsed.data

    const proxGeneracion = proxGeneracionInput
      ? new Date(proxGeneracionInput)
      : calcularProxGeneracion(new Date(), cadaNDias)

    // FIX F-26a: findUnique + create DENTRO de prisma.$transaction.
    // Antes: el findUnique (línea 96 antes del fix) corría FUERA
    // de tx. Dos admins creando plantilla para el mismo cliente
    // casi simultáneo pasaban el check, el segundo recibía P2002
    // → 409 (gracias al catch existente), pero el flujo wasted
    // (parsing, validación, etc.) y la UX era confusa.
    //
    // Ahora: prisma.$transaction con row lock implícito sobre la
    // unique constraint clienteId. La segunda tx espera y ve la
    // fila recién creada → 409 con mensaje específico.
    const plantilla = await prisma.$transaction(async (tx) => {
      const existente = await tx.plantillaRecurrente.findUnique({
        where: { clienteId },
      })
      if (existente) {
        throw new Error('PLANTILLA_YA_EXISTE')
      }

      return tx.plantillaRecurrente.create({
        data: {
          clienteId,
          tipo,
          canal,
          cadaNDias,
          horaPreferida: horaPreferida ?? null,
          productos: productosToJson(productos ?? {}),
          proxGeneracion,
          notas: notas ?? null,
          createdById: (authResult.user as { id: string }).id,
        },
        include: {
          cliente: { select: { id: true, nombre: true, telefono: true } },
        },
      })
    })

    logAudit({
      entidad: 'PlantillaRecurrente',
      registroId: plantilla.id,
      accion: 'CREATE',
      datos: { clienteId, cadaNDias },
      usuarioId: (authResult.user as { id: string }).id,
    })

    return apiSuccess({
      recurrente: { ...plantilla, productos: JSON.parse(plantilla.productos) },
    }, 201)
  } catch (error) {
    // FIX F-26a: mapear error thrown desde la tx
    if (error instanceof Error && error.message === 'PLANTILLA_YA_EXISTE') {
      return apiError('El cliente ya tiene una plantilla recurrente', 409)
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return apiError('El cliente ya tiene una plantilla recurrente', 409)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error creating plantilla recurrente:')
    return apiError('Error al crear plantilla recurrente', 500)
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return apiError('ID requerido', 400)

    const body = await request.json()
    const parsed = RecurrenteUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    // FIX F-26b: optimistic locking con updatedAt.
    // Antes: findUnique (línea 161) + update (línea 181) sin
    // verificar updatedAt. Dos PATCH casi simultáneos del mismo
    // recurrente con cambios a `cadaNDias` (que recalcula
    // proxGeneracion desde ultimaGeneracion) podían:
    //   T0: PATCH A lee existente.ultimaGeneracion=T0
    //   T0: PATCH B lee existente.ultimaGeneracion=T0 (mismo)
    //   T1: A hace update con cadaNDias=14, proxGeneracion recalculado
    //       desde ultimaGeneracion=T0
    //   T1: B hace update con cadaNDias=21, proxGeneracion recalculado
    //       desde ultimaGeneracion=T0 (stale)
    //   T2: Last-write-wins. La proxGeneracion calculada por el
    //       request perdedor queda en la DB.
    //
    // Ahora: updateMany con condición sobre updatedAt. Si el row
    // fue modificado entre el findUnique y el updateMany, count=0.
    // Devolvemos 409.
    const existente = await prisma.plantillaRecurrente.findUnique({ where: { id } })
    if (!existente) return apiError('Plantilla no encontrada', 404)

    const data: Record<string, unknown> = {}
    if (parsed.data.cadaNDias !== undefined) {
      data.cadaNDias = parsed.data.cadaNDias
      const base = existente.ultimaGeneracion ? new Date(existente.ultimaGeneracion) : new Date()
      data.proxGeneracion = calcularProxGeneracion(base, parsed.data.cadaNDias)
    }
    if (parsed.data.tipo) data.tipo = parsed.data.tipo
    if (parsed.data.canal) data.canal = parsed.data.canal
    if (parsed.data.horaPreferida !== undefined) data.horaPreferida = parsed.data.horaPreferida
    if (parsed.data.notas !== undefined) data.notas = parsed.data.notas
    if (parsed.data.activo !== undefined) data.activo = parsed.data.activo
    if (parsed.data.saltos) data.saltos = sanitizarSaltos(parsed.data.saltos)

    if (parsed.data.productos) {
      data.productos = productosToJson(parsed.data.productos)
    }

    const updateResult = await prisma.plantillaRecurrente.updateMany({
      where: {
        id,
        updatedAt: existente.updatedAt,
      },
      data,
    })

    if (updateResult.count === 0) {
      return apiError(
        'La plantilla fue modificada por otro usuario. Recarga y vuelve a intentar.',
        409,
      )
    }

    // Re-leer para devolver el estado final
    const plantilla = await prisma.plantillaRecurrente.findUnique({
      where: { id },
      include: {
        cliente: { select: { id: true, nombre: true } },
      },
    })
    if (!plantilla) return apiError('Plantilla no encontrada', 404)  // no debería pasar

    logAudit({
      entidad: 'PlantillaRecurrente',
      registroId: plantilla.id,
      accion: 'UPDATE',
      datos: { cadaNDias: parsed.data.cadaNDias },
      usuarioId: (authResult.user as { id: string }).id,
    })

    return apiSuccess({
      recurrente: { ...plantilla, productos: JSON.parse(plantilla.productos) },
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error updating plantilla recurrente:')
    return apiError('Error al actualizar', 500)
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'CONTADOR'], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return apiError('ID requerido', 400)

    const plantilla = await prisma.plantillaRecurrente.update({
      where: { id },
      data: { activo: false },
    })

    logAudit({
      entidad: 'PlantillaRecurrente',
      registroId: plantilla.id,
      accion: 'DELETE',
      datos: {},
      usuarioId: (authResult.user as { id: string }).id,
    })

    return apiSuccess({ recurrente: plantilla })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error deleting plantilla recurrente:')
    return apiError('Error al eliminar', 500)
  }
}
