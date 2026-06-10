import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'

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
