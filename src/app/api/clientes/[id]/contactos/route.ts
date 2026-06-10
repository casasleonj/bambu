import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ContactoAlternativoSchema } from '@/lib/validators'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { formatZodError } from '@/lib/utils'
import { ZodError } from 'zod'

/**
 * POST /api/clientes/[id]/contactos
 *
 * Crea un nuevo contacto alternativo para un cliente.
 * El `clienteId_telefono` unique constraint previene duplicados por teléfono:
 * si el cliente ya tiene un contacto con ese teléfono, devuelve 409.
 *
 * (Fase 3: la columna legacy `Cliente.contactos Json?` ya no existe,
 * los contactos viven solo en esta tabla.)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const { id } = await params

  try {
    const body = await request.json()
    const data = ContactoAlternativoSchema.parse(body)

    // Verificar que el cliente existe y está activo
    const cliente = await prisma.cliente.findUnique({
      where: { id, activo: true },
      select: { id: true },
    })
    if (!cliente) return apiError('Cliente no encontrado', 404)

    // Crear contacto. Si ya existe uno con mismo (clienteId, telefono),
    // Prisma lanza P2002 que capturamos abajo.
    const contacto = await prisma.contactoCliente.create({
      data: {
        clienteId: id,
        nombre: data.nombre,
        telefono: data.telefono,
        relacion: data.relacion ?? null,
      },
    })

    logAudit({
      entidad: 'ContactoCliente',
      registroId: contacto.id,
      accion: 'CREATE',
      datos: { clienteId: id, nombre: data.nombre },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({ contacto }, 201)
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError('Datos inválidos', 400, { formErrors: [formatZodError(error)] })
    }
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code: string }).code
      if (code === 'P2002') {
        return apiError(
          'Ya existe un contacto con ese teléfono para este cliente',
          409,
        )
      }
      if (code === 'P2003') {
        // FK violation: clienteId no existe
        return apiError('Cliente no encontrado', 404)
      }
    }
    return apiError('Error creando contacto')
  }
}
