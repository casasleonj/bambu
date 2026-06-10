import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ContactoAlternativoUpdateSchema } from '@/lib/validators'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { formatZodError } from '@/lib/utils'
import { ZodError } from 'zod'

/**
 * PATCH /api/clientes/[id]/contactos/[contactoId]
 *
 * Actualiza parcialmente un contacto alternativo. Todos los campos son
 * opcionales pero al menos uno debe estar presente.
 *
 * Si se cambia el `telefono`, se valida contra el `@@unique([clienteId, telefono])`:
 * P2002 → 409 (ya existe otro contacto con ese teléfono en el mismo cliente).
 *
 * Verifica ownership: el contacto debe pertenecer al cliente.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactoId: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const { id, contactoId } = await params

  try {
    const body = await request.json()
    const data = ContactoAlternativoUpdateSchema.parse(body)

    // Verificar ownership antes de tocar la DB
    const existente = await prisma.contactoCliente.findUnique({
      where: { id: contactoId },
      select: { clienteId: true, nombre: true, telefono: true, relacion: true },
    })

    if (!existente) return apiError('Contacto no encontrado', 404)
    if (existente.clienteId !== id) {
      // No leak: si el contacto existe pero no es de este cliente → 404
      return apiError('Contacto no encontrado', 404)
    }

    // Construir el patch solo con los campos provistos (no sobrescribir con undefined)
    const updateData: { nombre?: string; telefono?: string; relacion?: string | null } = {}
    if (data.nombre !== undefined) updateData.nombre = data.nombre
    if (data.telefono !== undefined) updateData.telefono = data.telefono
    if (data.relacion !== undefined) updateData.relacion = data.relacion ?? null

    const contacto = await prisma.contactoCliente.update({
      where: { id: contactoId },
      data: updateData,
    })

    logAudit({
      entidad: 'ContactoCliente',
      registroId: contactoId,
      accion: 'UPDATE',
      datos: {
        clienteId: id,
        cambios: updateData,
        antes: { nombre: existente.nombre, telefono: existente.telefono, relacion: existente.relacion },
      },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({ contacto })
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError('Datos inválidos', 400, { formErrors: [formatZodError(error)] })
    }
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code: string }).code
      if (code === 'P2002') {
        // Unique constraint [clienteId, telefono] violation
        return apiError(
          'Ya existe otro contacto con ese teléfono para este cliente',
          409,
        )
      }
      if (code === 'P2025') {
        return apiError('Contacto no encontrado', 404)
      }
    }
    return apiError('Error actualizando contacto')
  }
}

/**
 * DELETE /api/clientes/[id]/contactos/[contactoId]
 *
 * Borra un contacto alternativo de un cliente. Verifica que el contacto
 * pertenece al cliente (evita que un cliente borre contactos de otro
 * adivinando IDs).
 *
 * Idempotente: si el contacto no existe, devuelve 404.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; contactoId: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const { id, contactoId } = await params

  try {
    // Verificar que el contacto pertenece al cliente
    const contacto = await prisma.contactoCliente.findUnique({
      where: { id: contactoId },
      select: { clienteId: true, nombre: true, telefono: true },
    })

    if (!contacto) return apiError('Contacto no encontrado', 404)
    if (contacto.clienteId !== id) {
      // El contacto existe pero no es de este cliente: 404 (no leak info)
      return apiError('Contacto no encontrado', 404)
    }

    await prisma.contactoCliente.delete({
      where: { id: contactoId },
    })

    logAudit({
      entidad: 'ContactoCliente',
      registroId: contactoId,
      accion: 'DELETE',
      datos: { clienteId: id, nombre: contacto.nombre },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({ ok: true })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code: string }).code
      if (code === 'P2025') {
        return apiError('Contacto no encontrado', 404)
      }
    }
    return apiError('Error eliminando contacto')
  }
}
