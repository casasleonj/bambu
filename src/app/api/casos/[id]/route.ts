import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requirePermission, requireRole } from '@/lib/auth-check'
import { CasoUpdateSchema } from '@/lib/validators'
import { formatZodError } from '@/lib/utils'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // FIX CRITICAL (C-SEC-7c): Only users with view:casos can read a case
  const authResult = await requirePermission('view:casos')
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
  // FIX CRITICAL (C-SEC-7d): Only users with view:casos can patch a case
  // Previously: requireAuth() only — any user could assign cases to arbitrary users
  const authResult = await requirePermission('view:casos')
  if (authResult instanceof Response) return authResult

  const userId = (authResult.user as { id?: string } | undefined)?.id
  if (!userId) return apiError('No autorizado', 401)

  const { id } = await params

  // commit 3.2 plan antifraude: ?aplicarSolucion=true requiere rol
  // ADMIN/ASISTENTE (stricter que el PATCH normal). Solo estos pueden
  // ejecutar la accion correctiva automatica que cambia el estado
  // subyacente del cliente/pedido.
  const aplicarSolucion = request.nextUrl.searchParams.get('aplicarSolucion') === 'true'
  if (aplicarSolucion) {
    const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
    if (roleCheck instanceof Response) return roleCheck
  }

  try {
    const body = await request.json()

    // FIX CRITICAL (C-VAL-3): Use Zod schema to validate update body
    const parsed = CasoUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }
    const validatedBody = parsed.data

    // commit 3.2: si aplicarSolucion=true, ejecutar la accion
    // correctiva ANTES de la transaccion principal (pre-check de Pago
    // para alertas que lo requieren). Si falla, retornamos 400
    // explicito sin tocar el caso.
    if (aplicarSolucion) {
      const preCheck = await prisma.caso.findUnique({
        where: { id },
        select: {
          alertaTipo: true,
          clienteId: true,
          pedidoId: true,
          updatedAt: true,
        },
      })
      if (!preCheck) return apiError('Caso no encontrado', 404)

      const accionResult = await aplicarAccionCorrectiva(preCheck, id)
      if (!accionResult.ok) {
        return apiError(accionResult.error, accionResult.status, accionResult.code ? { code: accionResult.code } : undefined)
      }
    }

    const existing = await prisma.caso.findUnique({
      where: { id },
      select: { status: true, asignadoAId: true, notasResolucion: true, updatedAt: true },
    })

    if (!existing) return apiError('Caso no encontrado', 404)

    // FIX CRITICAL (C-VAL-4): Validate asignadoAId corresponds to a real active user
    if (validatedBody.asignadoAId !== undefined && validatedBody.asignadoAId !== null && validatedBody.asignadoAId !== '') {
      const userExists = await prisma.user.findUnique({
        where: { id: validatedBody.asignadoAId },
        select: { id: true, activo: true },
      })
      if (!userExists) return apiError('Usuario asignado no encontrado', 404)
      if (!userExists.activo) return apiError('No se puede asignar a un usuario inactivo', 400)
    }

    const updates: Record<string, unknown> = {}
    const eventosData: Array<{ userId: string; accion: string; valorPre?: string; valorPost?: string }> = []

    if (validatedBody.status !== undefined && validatedBody.status !== existing.status) {
      const statusChange = validatedBody.status
      updates.status = statusChange

      if (statusChange === 'RESUELTO') {
        updates.resueltoEn = new Date()
        if (validatedBody.notasResolucion) {
          updates.notasResolucion = validatedBody.notasResolucion
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

    if (validatedBody.asignadoAId !== undefined && validatedBody.asignadoAId !== existing.asignadoAId) {
      updates.asignadoAId = validatedBody.asignadoAId || null

      if (validatedBody.asignadoAId) {
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
        valorPost: validatedBody.asignadoAId || 'sin asignar',
      })
    }

    if (validatedBody.notasResolucion !== undefined && validatedBody.notasResolucion !== existing.notasResolucion) {
      updates.notasResolucion = validatedBody.notasResolucion
    }

    if (validatedBody.titulo) updates.titulo = validatedBody.titulo
    if (validatedBody.descripcion !== undefined) updates.descripcion = validatedBody.descripcion

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

/**
 * commit 3.2 plan antifraude: ejecuta la accion correctiva del caso
 * segun su alertaTipo. Se llama ANTES de la transaccion principal
 * del PATCH (en un pre-check) para que:
 *   - Validaciones de Pago (CLIENTE_BLOQUEADO, PROMESA_PROXIMA_VENCER)
 *     fallen rapido sin tocar la tx del caso
 *   - Errores de tipo no auto-resoluble retornen 400 explicito
 *   - El caso se actualice con status=RESUELTO solo si la accion
 *     correctiva se aplico exitosamente
 *
 * Tipos auto-resolubles:
 *   - CLIENTE_NO_VERIFICADO → cliente.verificado = true
 *   - DISPUTA_ABIERTA → pedido.disputaAbierta = false
 *   - CLIENTE_BLOQUEADO → requiere Pago, luego pedido.estadoPago = PAGADO
 *   - PROMESA_PROXIMA_VENCER → requiere Pago, luego pedido.estadoPago = PAGADO
 *   - FIADO_REcurrente → cliente.bloqueado = true
 *
 * Tipos NO auto-resolubles (admin debe actuar manualmente):
 *   - RECLAMACIONES_MULTIPLES, RECLAMACION_ACTIVA: contador puede ser legitimo
 *   - PRECIO_POR_DEBAJO_TABLA: admin debe revisar y corregir manualmente
 *   - DESCUENTO_NO_JUSTIFICADO: admin debe adjuntar evidencia
 *   - MONTO_ANOMALO: pedido grande puede ser legitimo
 *   - NOTA_CREDITO_FRECUENTE: admin debe confirmar patron
 *   - CAMBIO_PRECIO_BRUSCO: admin debe revisar
 *   - DEVOLUCIONES_ANORMALES, ROTURAS_ANORMALES: admin debe investigar
 *   - REPARTIDOR_DEUDA_ALTA: admin debe negociar plan
 *   - 1ER/2DO/3RO_PEDIDO, MULTIPLES_PEDIDOS_RAPIDO, NO_ENTREGADO_REPETIDO: solo marcar revisado
 */
async function aplicarAccionCorrectiva(
  preCheck: { alertaTipo: string; clienteId: string | null; pedidoId: string | null },
  casoId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number; code?: string }> {
  const { alertaTipo, clienteId, pedidoId } = preCheck

  try {
    switch (alertaTipo) {
      case 'CLIENTE_NO_VERIFICADO': {
        if (!clienteId) return { ok: false, error: 'Caso sin clienteId', status: 400 }
        await prisma.cliente.update({
          where: { id: clienteId },
          data: { verificado: true, verificadoEn: new Date() },
        })
        return { ok: true }
      }

      case 'DISPUTA_ABIERTA': {
        if (!pedidoId) return { ok: false, error: 'Caso sin pedidoId', status: 400 }
        await prisma.pedido.update({
          where: { id: pedidoId },
          data: { disputaAbierta: false },
        })
        return { ok: true }
      }

      case 'CLIENTE_BLOQUEADO':
      case 'PROMESA_PROXIMA_VENCER': {
        if (!pedidoId) return { ok: false, error: 'Caso sin pedidoId', status: 400 }
        // commit 3.2 validacion: requerir Pago registrado antes de
        // marcar como PAGADO. Si no hay Pago, no se puede auto-marcar.
        const pagoCount = await prisma.pago.count({
          where: { pedidoId, monto: { gt: 0 } },
        })
        if (pagoCount === 0) {
          return {
            ok: false,
            error: 'PAGO_REQUERIDO: Registra el pago antes de marcar el pedido como PAGADO.',
            status: 400,
          }
        }
        await prisma.pedido.update({
          where: { id: pedidoId },
          data: { estadoPago: 'PAGADO' },
        })
        return { ok: true }
      }

      case 'FIADO_REcurrente': {
        if (!clienteId) return { ok: false, error: 'Caso sin clienteId', status: 400 }
        await prisma.cliente.update({
          where: { id: clienteId },
          data: { bloqueado: true },
        })
        return { ok: true }
      }

      default:
        // commit 3.2: este tipo NO es auto-resoluble. El admin debe
        // actuar manualmente (verificar con cliente, adjuntar
        // evidencia, etc). Devolvemos error con code explicito
        // para que la UI detecte y haga fallback al PATCH normal.
        return {
          ok: false,
          error: `AUTO_RESOLVER_NO_APLICA: El tipo de alerta '${alertaTipo}' requiere accion manual del admin (no se puede auto-resolver).`,
          status: 400,
          code: 'AUTO_RESOLVER_NO_APLICA',
        }
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Unknown'
    logger.error({ err: errMsg, casoId, alertaTipo }, '[auto-resolver] error aplicando accion')
    return { ok: false, error: 'Error aplicando accion correctiva', status: 500 }
  }
}
