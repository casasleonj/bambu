import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ClienteQuickCreateSchema } from '@/lib/validators'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/audit'
import { apiSuccess, apiError } from '@/lib/api-response'
import { ROLES } from '@/lib/constants'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.CONTADOR, ROLES.REPARTIDOR], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json()
    const parsed = ClienteQuickCreateSchema.safeParse(body)

    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const { nombre, apellido, telefono, direccion, barrio } = parsed.data

    const existing = await prisma.cliente.findFirst({
      where: {
        activo: true,
        OR: [
          { telefono },
          { contactos: { path: ['[*].telefono'], equals: telefono } },
        ],
      },
      select: { id: true, nombre: true, telefono: true },
    })

    if (existing) {
      return apiSuccess({ cliente: existing })
    }

    // Crear cliente nuevo con datos básicos
    const cliente = await prisma.cliente.create({
      data: {
        nombre,
        apellido,
        telefono,
        direccion,
        barrio: barrio || '',
      },
    })

    logAudit({
      entidad: 'Cliente',
      registroId: cliente.id,
      accion: 'CREATE',
      datos: { nombre, telefono },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({ cliente }, 201)
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error creating quick client:')
    return apiError('Error creating client', 500)
  }
}
