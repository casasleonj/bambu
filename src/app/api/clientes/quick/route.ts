import { formatZodError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ClienteQuickCreateSchema } from '@/lib/validators'
import { requireAuth } from '@/lib/auth-check'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/audit'
import { apiSuccess, apiError } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof NextResponse) return authResult

  try {
    const body = await request.json()
    const parsed = ClienteQuickCreateSchema.safeParse(body)

    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const { nombre, telefono, direccion, barrio } = parsed.data

    // Buscar cliente existente por celular
    const existing = await prisma.cliente.findFirst({
      where: { telefono },
    })

    if (existing) {
      return apiSuccess({ cliente: existing })
    }

    // Crear cliente nuevo con datos básicos
    const cliente = await prisma.cliente.create({
      data: {
        nombre,
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
