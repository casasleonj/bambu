import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { TrabajadorUpdateSchema } from '@/lib/validators'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    const body = await request.json()
    const parsed = TrabajadorUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }
    const trabajador = await prisma.trabajador.update({
      where: { id },
      data: parsed.data,
    })

    logAudit({
      entidad: 'Trabajador',
      registroId: trabajador.id,
      accion: 'UPDATE',
      datos: { nombre: trabajador.nombre, rol: trabajador.rol },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({ trabajador })
  } catch (error) {
    return apiError('Error actualizando trabajador')
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    const trabajador = await prisma.trabajador.findUnique({ where: { id } })
    if (!trabajador) {
      return apiError('Trabajador no encontrado', 404)
    }
    if (!trabajador.activo) {
      return apiError('El trabajador ya esta desactivado', 409)
    }

    const embarquesAbiertos = await prisma.embarque.count({
      where: { trabajadorId: id, estado: 'ABIERTO' },
    })
    if (embarquesAbiertos > 0) {
      return apiError(
        `No se puede desactivar: tiene ${embarquesAbiertos} embarque(s) abierto(s). Cierrellos primero.`,
        400
      )
    }

    await prisma.trabajador.update({
      where: { id },
      data: { activo: false },
    })

    logAudit({
      entidad: 'Trabajador',
      registroId: trabajador.id,
      accion: 'DELETE',
      datos: { nombre: trabajador.nombre, rol: trabajador.rol },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({})
  } catch (error) {
    return apiError('Error eliminando trabajador')
  }
}
