import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { EstadoEmbarque } from '@prisma/client'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const GastoEmbarqueSchema = z.object({
  categoria: z.string().min(1),
  monto: z.coerce.number().positive(),
  nota: z.string().max(500).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.REPARTIDOR], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  const session = authResult as { user?: { id?: string; role?: string } }

  try {
    const embarque = await prisma.embarque.findUnique({
      where: { id },
    })

    if (!embarque) return apiError('Embarque no encontrado', 404)
    if (embarque.estado === EstadoEmbarque.CERRADO || embarque.estado === EstadoEmbarque.CANCELADO) {
      return apiError('No se pueden agregar gastos a embarques cerrados o cancelados', 400)
    }

    const body = await request.json()
    const parsed = GastoEmbarqueSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400)
    }

    const gasto = await prisma.gasto.create({
      data: {
        categoria: parsed.data.categoria,
        descripcion: parsed.data.nota || parsed.data.categoria,
        monto: parsed.data.monto,
        responsable: embarque.trabajadorId,
        notas: parsed.data.nota,
        embarqueId: id,
        createdById: (session.user as { id?: string })?.id,
      },
    })

    logAudit({
      entidad: 'Gasto',
      registroId: gasto.id,
      accion: 'CREATE',
      datos: { embarqueId: id, categoria: gasto.categoria, monto: gasto.monto },
      usuarioId: session.user?.id,
    })

    return apiSuccess({ gasto }, 201)
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error creando gasto:')
    return apiError('Error creando gasto')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params

  const { searchParams } = new URL(request.url)
  const gastoId = searchParams.get('gastoId')
  if (!gastoId) return apiError('gastoId requerido', 400)

  try {
    await prisma.gasto.delete({
      where: { id: gastoId, embarqueId: id },
    })

    return apiSuccess({ message: 'Gasto eliminado' })
  } catch (error) {
    return apiError('Error eliminando gasto')
  }
}
