import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { SafeUrlSchema } from '@/lib/validators'
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
  linkUbicacion: SafeUrlSchema.optional().or(z.literal('')),
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

// PUT /api/negocios?id=xxx
export async function PUT(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    if (!id) return apiError('ID requerido', 400)

    const body = await request.json()
    const parsed = NegocioUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos inválidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }

    // FIX F-35b: optimistic locking con updatedAt.
    // Antes: prisma.negocio.findUnique + update directo sin tx.
    // Dos admins editando el mismo negocio casi simultáneo,
    // last-write-wins silencioso. Cambios manuales perdidos.
    //
    // Ahora: prisma.$transaction con row lock + updateMany con
    // condición sobre updatedAt. Si el row fue modificado,
    // count=0 → 409 con mensaje específico.
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.negocio.findUnique({
        where: { id },
        select: { updatedAt: true },
      })
      if (!existing) throw new Error('NEGOCIO_NOT_FOUND')

      const updateResult = await tx.negocio.updateMany({
        where: { id, updatedAt: existing.updatedAt },
        data: parsed.data,
      })
      if (updateResult.count === 0) {
        throw new Error('NEGOCIO_MODIFICADO_POR_OTRO_ADMIN')
      }

      return tx.negocio.findUnique({
        where: { id },
        include: {
          cliente: { select: { id: true, nombre: true, apellido: true } },
          ruta: { select: { id: true, nombre: true } },
        },
      })
    })

    if (!result) throw new Error('NEGOCIO_NOT_FOUND')

    logAudit({
      entidad: 'Negocio',
      registroId: id,
      accion: 'UPDATE',
      datos: parsed.data,
      usuarioId: authResult.user?.id,
    })

    return apiSuccess({ negocio: result, message: 'Negocio actualizado exitosamente' })
  } catch (error) {
    // FIX F-35b: mapear errores thrown desde la tx
    if (error instanceof Error) {
      if (error.message === 'NEGOCIO_NOT_FOUND') {
        return apiError('Negocio no encontrado', 404)
      }
      if (error.message === 'NEGOCIO_MODIFICADO_POR_OTRO_ADMIN') {
        return apiError('El negocio fue modificado por otro admin. Recarga y vuelve a intentar.', 409)
      }
    }
    return apiError('Error al actualizar negocio', 500)
  }
}

// DELETE /api/negocios?id=xxx
export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    if (!id) return apiError('ID requerido', 400)

    // FIX F-35c: read+check+delete DENTRO de prisma.$transaction.
    // Antes: findUnique con _count.pedidos + check + delete sin tx.
    // Si un pedido se crea entre el count y el delete, FK
    // constraint falla con 500. Raro pero posible.
    //
    // Ahora: prisma.$transaction con row lock. Re-leer el count
    // dentro de la tx. Si hay pedidos, throw NEGOCIO_TIENE_PEDIDOS.
    // Si no, delete. Atómico.
    const deleted = await prisma.$transaction(async (tx) => {
      const existing = await tx.negocio.findUnique({
        where: { id },
        include: { _count: { select: { pedidos: true } } },
      })
      if (!existing) {
        throw new Error('NEGOCIO_NOT_FOUND')
      }

      // Prevent deletion if there are associated pedidos
      if (existing._count.pedidos > 0) {
        throw new Error(`NEGOCIO_TIENE_PEDIDOS:${existing._count.pedidos}`)
      }

      await tx.negocio.delete({ where: { id } })

      return existing
    })

    logAudit({
      entidad: 'Negocio',
      registroId: id,
      accion: 'DELETE',
      datos: { nombre: deleted.nombre },
      usuarioId: authResult.user?.id,
    })

    return apiSuccess({ message: 'Negocio eliminado exitosamente' })
  } catch (error) {
    // FIX F-35c: mapear errores thrown desde la tx
    if (error instanceof Error) {
      if (error.message === 'NEGOCIO_NOT_FOUND') {
        return apiError('Negocio no encontrado', 404)
      }
      if (error.message.startsWith('NEGOCIO_TIENE_PEDIDOS:')) {
        const count = error.message.split(':')[1]
        return apiError(
          `No se puede eliminar: tiene ${count} pedido(s) asociado(s)`,
          400,
        )
      }
    }
    return apiError('Error al eliminar negocio', 500)
  }
}
