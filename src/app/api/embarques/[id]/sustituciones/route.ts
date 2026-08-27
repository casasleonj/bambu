/**
 * Sustituciones de producto defectuoso — ADR-SUSTITUCION-001 / contrato §9.
 *
 * Thin controller: expone la operación ya modelada en el dominio
 * (`construirMovimientosSustitucion`) + modelo `Sustitucion`. Una sustitución
 * produce DOS movimientos físicos SEPARADOS (RETORNO repartidor→inspección +
 * ENTREGA repartidor→cliente), nunca un movimiento ambiguo con doble efecto.
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/audit'
import { publishRealtimeEvent } from '@/lib/realtime'
import { SustitucionEmbarqueSchema } from '@/lib/validators'
import {
  construirMovimientosSustitucion,
  validarMovimientoFisico,
} from '@/modules/embarques/domain/services/ledger-fisico.service'

const sustitucionInclude = {
  movimientoRecepcion: true,
  movimientoEntrega: true,
  autorizadoPor: { select: { id: true, nombre: true } },
} as const

/**
 * GET /api/embarques/[id]/sustituciones — lista las sustituciones del embarque,
 * más reciente primero. Mismo control de acceso que GET /api/embarques/[id].
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params
  const session = authResult as { user?: { id?: string; role?: string } }
  const hasAccess = await requireOwnership('embarque', id, { id: session.user?.id || '', role: session.user?.role })
  if (!hasAccess) return apiError('Forbidden', 403)

  try {
    const sustituciones = await prisma.sustitucion.findMany({
      where: { embarqueId: id },
      include: sustitucionInclude,
      orderBy: { createdAt: 'desc' },
    })
    return apiSuccess({ sustituciones })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error listando sustituciones')
    return apiError('Error listando sustituciones', 500)
  }
}

/**
 * POST /api/embarques/[id]/sustituciones — registra una sustitución.
 * Persiste 2 EmbarqueMovimiento (RETORNO + ENTREGA) + 1 Sustitucion en una
 * transacción. Idempotente por `Sustitucion.offlineId`.
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
  const session = authResult as { user?: { id?: string; role?: string } }
  const hasAccess = await requireOwnership('embarque', id, { id: session.user?.id || '', role: session.user?.role })
  if (!hasAccess) return apiError('Forbidden', 403)

  let offlineId: string | undefined
  try {
    const body = await request.json()
    const parsed = SustitucionEmbarqueSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }
    const { producto, cantidad, pedidoId, motivo } = parsed.data
    offlineId = parsed.data.offlineId

    // Idempotencia (ADR-IDEMPOTENCIA-001 / contrato §14).
    if (offlineId) {
      const existente = await prisma.sustitucion.findUnique({
        where: { offlineId },
        include: sustitucionInclude,
      })
      if (existente) {
        if (existente.embarqueId !== id) return apiError('offlineId ya usado en otro embarque', 409)
        return apiSuccess({ sustitucion: existente, deduped: true })
      }
    }

    const embarque = await prisma.embarque.findUnique({ where: { id }, select: { id: true, estado: true } })
    if (!embarque) return apiError('Embarque no encontrado', 404)
    if (embarque.estado === 'CERRADO' || embarque.estado === 'CANCELADO') {
      return apiError(`No se pueden registrar sustituciones en un embarque ${embarque.estado}`, 400)
    }
    if (pedidoId) {
      const pedido = await prisma.pedido.findFirst({ where: { id: pedidoId, embarqueId: id }, select: { id: true } })
      if (!pedido) return apiError('El pedido no pertenece a este embarque', 400)
    }

    const { recepcion, entrega } = construirMovimientosSustitucion({ producto, cantidad })
    const errores = [
      ...validarMovimientoFisico(recepcion),
      ...validarMovimientoFisico(entrega),
    ]
    if (errores.length > 0) return apiError(errores.join('; '), 400)

    const metaRecepcion = { ...recepcion.metadata, ...(motivo ? { motivoDetalle: motivo } : {}) }

    const sustitucion = await prisma.$transaction(async (tx) => {
      const movRecepcion = await tx.embarqueMovimiento.create({
        data: {
          embarqueId: id,
          tipo: recepcion.tipo,
          producto: recepcion.producto,
          cantidad: recepcion.cantidad,
          origen: recepcion.origen ?? null,
          destino: recepcion.destino ?? null,
          metadata: metaRecepcion as unknown as Prisma.InputJsonValue,
        },
      })
      const movEntrega = await tx.embarqueMovimiento.create({
        data: {
          embarqueId: id,
          tipo: entrega.tipo,
          producto: entrega.producto,
          cantidad: entrega.cantidad,
          origen: entrega.origen ?? null,
          destino: entrega.destino ?? null,
        },
      })
      const creada = await tx.sustitucion.create({
        data: {
          embarqueId: id,
          pedidoId: pedidoId ?? null,
          movimientoRecepcionId: movRecepcion.id,
          movimientoEntregaId: movEntrega.id,
          autorizadoPorId: session.user?.id ?? null,
          offlineId: offlineId ?? null,
        },
        include: sustitucionInclude,
      })
      await logAudit(
        {
          entidad: 'Embarque',
          registroId: id,
          accion: 'UPDATE',
          datos: { sustitucionId: creada.id, producto, cantidad, pedidoId: pedidoId ?? null },
          usuarioId: session.user?.id,
        },
        tx,
      )
      return creada
    })

    publishRealtimeEvent('embarque.updated', id).catch(() => {})

    return apiSuccess({ sustitucion }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    // Carrera: otro request con el mismo offlineId ganó entre el check y el insert.
    if (offlineId && message.includes('Unique constraint') && message.includes('offlineId')) {
      const existente = await prisma.sustitucion
        .findUnique({ where: { offlineId }, include: sustitucionInclude })
        .catch(() => null)
      if (existente) return apiSuccess({ sustitucion: existente, deduped: true })
    }
    logger.error({ err: message }, 'Error registrando sustitución')
    return apiError('Error registrando sustitución', 500)
  }
}
