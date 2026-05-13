import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const userId = (authResult.user as { id?: string } | undefined)?.id
  if (!userId) return apiError('No autorizado', 401)

  try {
    const { id } = await params
    const body = await request.json()
    const { accion, comentario } = body

    if (!accion) {
      return apiError('Falta campo requerido: accion', 400)
    }

    const caso = await prisma.caso.findUnique({
      where: { id },
      select: { id: true, status: true },
    })

    if (!caso) return apiError('Caso no encontrado', 404)

    const evento = await prisma.casoEvento.create({
      data: {
        casoId: id,
        userId,
        accion,
        comentario: comentario || null,
      },
      include: {
        user: { select: { id: true, username: true } },
      },
    })

    logAudit({
      entidad: 'CasoEvento',
      registroId: evento.id,
      accion: 'CREATE',
      datos: { casoId: id, accion },
      usuarioId: userId,
    })

    return apiSuccess({ evento }, 201)
  } catch (error) {
    return apiError('Error agregando evento')
  }
}
