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

    const existente = await prisma.plantillaRecurrente.findUnique({
      where: { clienteId },
    })
    if (existente) {
      return apiError('El cliente ya tiene una plantilla recurrente', 409)
    }

    const proxGeneracion = proxGeneracionInput
      ? new Date(proxGeneracionInput)
      : calcularProxGeneracion(new Date(), cadaNDias)

    const plantilla = await prisma.plantillaRecurrente.create({
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

    const plantilla = await prisma.plantillaRecurrente.update({
      where: { id },
      data,
      include: {
        cliente: { select: { id: true, nombre: true } },
      },
    })

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
