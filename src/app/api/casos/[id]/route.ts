import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const { id } = await params

    const caso = await prisma.caso.findUnique({
      where: { id },
      include: {
        cliente: { select: { id: true, nombre: true, telefono: true, direccion: true } },
        pedido: { select: { id: true, numero: true, total: true, estadoPago: true, estadoEntrega: true } },
        asignadoA: { select: { id: true, username: true } },
        creadoPor: { select: { id: true, username: true } },
        eventos: {
          include: {
            user: { select: { id: true, username: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!caso) return apiError('Caso no encontrado', 404)

    return apiSuccess({ caso })
  } catch (error) {
    return apiError('Error cargando caso')
  }
}

export async function PATCH(
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

    const existing = await prisma.caso.findUnique({
      where: { id },
      select: { status: true, asignadoAId: true, notasResolucion: true, updatedAt: true },
    })

    if (!existing) return apiError('Caso no encontrado', 404)

    const updates: Record<string, unknown> = {}
    const eventosData: Array<{ userId: string; accion: string; valorPre?: string; valorPost?: string }> = []

    if (body.status !== undefined && body.status !== existing.status) {
      const statusChange = body.status as string
      updates.status = statusChange

      if (statusChange === 'RESUELTO') {
        updates.resueltoEn = new Date()
        if (body.notasResolucion) {
          updates.notasResolucion = body.notasResolucion
        }
      }

      if (statusChange === 'CERRADO') {
        updates.cerradoEn = new Date()
      }

      if (statusChange === 'ABIERTO' || statusChange === 'EN_PROCESO') {
        if (existing.status === 'RESUELTO') {
          updates.resueltoEn = null
        }
        if (existing.status === 'CERRADO' || existing.status === 'RESUELTO') {
          updates.cerradoEn = null
        }
      }

      eventosData.push({
        userId,
        accion: 'status_change',
        valorPre: existing.status,
        valorPost: statusChange,
      })
    }

    if (body.asignadoAId !== undefined && body.asignadoAId !== existing.asignadoAId) {
      updates.asignadoAId = body.asignadoAId || null

      if (body.asignadoAId) {
        if (!existing.asignadoAId) {
          updates.status = 'EN_PROCESO'
          eventosData.push({
            userId,
            accion: 'status_change',
            valorPre: existing.status,
            valorPost: 'EN_PROCESO',
          })
        }
      }

      eventosData.push({
        userId,
        accion: 'asignado',
        valorPost: body.asignadoAId || 'sin asignar',
      })
    }

    if (body.notasResolucion !== undefined && body.notasResolucion !== existing.notasResolucion) {
      updates.notasResolucion = body.notasResolucion
    }

    if (body.titulo) updates.titulo = body.titulo
    if (body.descripcion !== undefined) updates.descripcion = body.descripcion

    if (Object.keys(updates).length === 0 && eventosData.length === 0) {
      return apiError('No hay cambios para aplicar', 400)
    }

    // FIX F-N19 (hallazgo 21): optimistic locking con updatedAt.
    // Antes: el findUnique se hacía FUERA de tx, y el updateMany
    // dentro de la tx no verificaba si el row había sido modificado
    // entre el read y el write. Dos PATCH simultáneos con cambios
    // a status+asignado podían:
    //   T0: PATCH A lee existing.status=ABIERTO, existing.asignadoAId=null
    //   T0: PATCH B lee existing.status=ABIERTO, existing.asignadoAId=null
    //       (mismo resultado, ambos leen antes de que cualquiera
    //       commitee)
    //   T1: PATCH A hace update con status=EN_PROCESO, evento status_change
    //   T1: PATCH B hace update con asignadoAId=user-X, evento asignado
    //   T2: Ambos commits. Status final: last-write-wins por campo.
    //       Eventos: ambos commits crean eventos, con valorPre stale
    //       ('ABIERTO' cuando el caso ya está EN_PROCESO). Trazabilidad sucia.
    //
    // Ahora: updateMany con condición sobre updatedAt. Si otro PATCH
    // commiteó primero, su update cambió updatedAt, por lo que el
    // where no matchea y count=0. Devolvemos 409.
    const caso = await prisma.$transaction(async (tx) => {
      // Atomic update con optimistic lock
      const updateResult = await tx.caso.updateMany({
        where: {
          id,
          updatedAt: existing.updatedAt,
        },
        data: updates,
      })

      if (updateResult.count === 0) {
        throw new Error('CASO_MODIFICADO_POR_OTRO_USUARIO')
      }

      // Re-leer el caso con los datos actualizados
      const updated = await tx.caso.findUnique({
        where: { id },
        include: {
          cliente: { select: { id: true, nombre: true } },
          pedido: { select: { id: true, numero: true } },
          asignadoA: { select: { id: true, username: true } },
        },
      })

      if (!updated) throw new Error('CASO_NOT_FOUND')  // no debería pasar

      if (eventosData.length > 0) {
        await tx.casoEvento.createMany({
          data: eventosData.map(e => ({
            casoId: id,
            userId: e.userId,
            accion: e.accion,
            valorPre: e.valorPre || null,
            valorPost: e.valorPost || null,
          })),
        })
      }

      return updated
    })

    logAudit({
      entidad: 'Caso',
      registroId: id,
      accion: 'UPDATE',
      datos: updates,
      usuarioId: userId,
    })

    return apiSuccess({ caso })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'CASO_MODIFICADO_POR_OTRO_USUARIO') {
        return apiError('El caso fue modificado por otro usuario. Recarga y vuelve a intentar.', 409)
      }
      if (error.message === 'CASO_NOT_FOUND') {
        return apiError('Caso no encontrado', 404)
      }
    }
    return apiError('Error actualizando caso')
  }
}
