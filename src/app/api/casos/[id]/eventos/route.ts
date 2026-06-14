import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth-check'
import { CasoEventoCreateSchema } from '@/lib/validators'
import { formatZodError } from '@/lib/utils'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // FIX CRITICAL (C-SEC-7e): Only users with view:casos can add eventos
  const authResult = await requirePermission('view:casos')
  if (authResult instanceof Response) return authResult

  const userId = (authResult.user as { id?: string } | undefined)?.id
  if (!userId) return apiError('No autorizado', 401)

  try {
    const { id } = await params
    const body = await request.json()
    // FIX CRITICAL (C-VAL-5): Use Zod schema for evento creation
    const parsed = CasoEventoCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }
    const { accion, valorPre, valorPost, comentario } = parsed.data

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
        valorPre: valorPre || null,
        valorPost: valorPost || null,
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
