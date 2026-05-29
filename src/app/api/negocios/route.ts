import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { z } from 'zod'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiList, apiError } from '@/lib/api-response'

const NegocioCreateSchema = z.object({
  clienteId: z.string().min(1),
  nombre: z.string().min(1, 'Nombre requerido'),
  tipoNegocio: z.string().optional(),
  direccion: z.string().optional(),
  barrio: z.string().optional(),
  referencia: z.string().optional(),
  linkUbicacion: z.string().url().optional().or(z.literal('')),
  horaApertura: z.string().optional(),
  rutaId: z.string().optional().nullable(),
  preciosEspeciales: z.string().optional().nullable(),
  habAgua: z.boolean().optional().default(true),
  habHielo: z.boolean().optional().default(true),
  habBotellon: z.boolean().optional().default(true),
  habBolsaAgua: z.boolean().optional().default(true),
  habBolsaHielo: z.boolean().optional().default(true),
  frecuencia: z.string().optional().nullable(),
  cadaNDias: z.number().int().min(1).optional().nullable(),
})

const NegocioUpdateSchema = NegocioCreateSchema.partial()

// GET /api/negocios?clienteId=xxx
export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { searchParams } = new URL(request.url)
  const clienteId = searchParams.get('clienteId')

  try {
    const where = clienteId ? { clienteId } : {}

    const negocios = await prisma.negocio.findMany({
      where,
      include: {
        cliente: { select: { id: true, nombre: true, apellido: true, telefono: true } },
        ruta: { select: { id: true, nombre: true } },
        _count: { select: { pedidos: true } },
      },
      orderBy: { nombre: 'asc' },
    })

    return apiList(negocios)
  } catch (error) {
    return apiError('Error al obtener negocios', 500)
  }
}

// POST /api/negocios
export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json()
    const parsed = NegocioCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos inválidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }

    // Verify cliente exists
    const cliente = await prisma.cliente.findUnique({
      where: { id: parsed.data.clienteId },
      select: { id: true },
    })
    if (!cliente) {
      return apiError('Cliente no encontrado', 404)
    }

    const negocio = await prisma.negocio.create({
      data: {
        ...parsed.data,
        createdById: authResult.user?.id,
      },
      include: {
        cliente: { select: { id: true, nombre: true, apellido: true } },
        ruta: { select: { id: true, nombre: true } },
      },
    })

    logAudit({
      entidad: 'Negocio',
      registroId: negocio.id,
      accion: 'CREATE',
      datos: { nombre: negocio.nombre, clienteId: negocio.clienteId },
      usuarioId: authResult.user?.id,
    })

    return apiSuccess({ negocio, message: 'Negocio creado exitosamente' })
  } catch (error) {
    return apiError('Error al crear negocio', 500)
  }
}

// PUT /api/negocios/[id]
export async function PUT(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const url = new URL(request.url)
    const id = url.pathname.split('/').pop()
    if (!id) return apiError('ID requerido', 400)

    const body = await request.json()
    const parsed = NegocioUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos inválidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }

    const existing = await prisma.negocio.findUnique({ where: { id } })
    if (!existing) {
      return apiError('Negocio no encontrado', 404)
    }

    const negocio = await prisma.negocio.update({
      where: { id },
      data: parsed.data,
      include: {
        cliente: { select: { id: true, nombre: true, apellido: true } },
        ruta: { select: { id: true, nombre: true } },
      },
    })

    logAudit({
      entidad: 'Negocio',
      registroId: id,
      accion: 'UPDATE',
      datos: parsed.data,
      usuarioId: authResult.user?.id,
    })

    return apiSuccess({ negocio, message: 'Negocio actualizado exitosamente' })
  } catch (error) {
    return apiError('Error al actualizar negocio', 500)
  }
}

// DELETE /api/negocios/[id]
export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const url = new URL(request.url)
    const id = url.pathname.split('/').pop()
    if (!id) return apiError('ID requerido', 400)

    const existing = await prisma.negocio.findUnique({
      where: { id },
      include: { _count: { select: { pedidos: true } } },
    })
    if (!existing) {
      return apiError('Negocio no encontrado', 404)
    }

    // Prevent deletion if there are associated pedidos
    if (existing._count.pedidos > 0) {
      return apiError(
        `No se puede eliminar: tiene ${existing._count.pedidos} pedido(s) asociado(s)`,
        400,
      )
    }

    await prisma.negocio.delete({ where: { id } })

    logAudit({
      entidad: 'Negocio',
      registroId: id,
      accion: 'DELETE',
      datos: { nombre: existing.nombre },
      usuarioId: authResult.user?.id,
    })

    return apiSuccess({ message: 'Negocio eliminado exitosamente' })
  } catch (error) {
    return apiError('Error al eliminar negocio', 500)
  }
}
