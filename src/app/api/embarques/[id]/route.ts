import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check'
import { EmbarqueUpdateSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { calcularPacasEmbarque, calcularPesoEmbarque, calcularPesoDesdeCarga, getCapacidadInfo, type CargaSnapshot } from '@/lib/embarque-capacidad'
import { withAdvisoryLock } from '@/lib/locks'
import { emptyStock } from '@/lib/stock'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'

// Fields that can only be edited when embarque is ABIERTO
const ABIERTO_ONLY_FIELDS = ['trabajadorId', 'rutaId', 'horaSalida', 'baseDinero', 'tipoMoto', 'carga'] as const

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params
  const session = authResult as { user?: { id?: string; role?: string } }
  const hasAccess = await requireOwnership('embarque', id, { id: session.user?.id || '', role: session.user?.role })
    if (!hasAccess) return apiError('Forbidden', 403)
  try {
    const embarque = await prisma.embarque.findUnique({
      where: { id },
      include: {
        trabajador: true,
        ruta: true,
        pedidos: {
          include: { cliente: true, pagos: true },
        },
        productos: true,
      },
    })
    if (!embarque) return apiError('Not found', 404)
    return apiSuccess({ embarque })
  } catch (error) {
    return apiError('Error', 500)
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  const session = authResult as { user?: { id?: string; role?: string } }
  const hasAccess = await requireOwnership('embarque', id, { id: session.user?.id || '', role: session.user?.role })
  if (!hasAccess) return apiError('Forbidden', 403)
  try {
    const body = await request.json()
    const parsed = EmbarqueUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const { pedidoIds, obs, estado, horaLlegada, horaSalida, trabajadorId, rutaId, tipoMoto, baseDinero, carga, ...rest } = parsed.data

    // Fetch current embarque to check state
    const currentEmbarque = await prisma.embarque.findUnique({
      where: { id },
      include: { trabajador: true, productos: true },
    })
    if (!currentEmbarque) return apiError('Embarque no encontrado', 404)

    // Enforce field restrictions by state
    if (currentEmbarque.estado !== 'ABIERTO') {
      const forbiddenFields = ABIERTO_ONLY_FIELDS.filter((field) => parsed.data[field] !== undefined)
      if (forbiddenFields.length > 0) {
        return apiError(`No se pueden editar estos campos en estado ${currentEmbarque.estado}: ${forbiddenFields.join(', ')}`, 400)
      }
    }

    // Prevent closing via PUT — must use cierre flow
    if (estado === 'CERRADO') {
      return apiError('Use el flujo de cierre de ruta para cerrar embarques', 400)
    }

    // Validate carga if it's being updated (only for ABIERTO)
    if (carga && currentEmbarque.estado === 'ABIERTO' && carga.length > 0) {
      const cargaSnapshot: CargaSnapshot = emptyStock() as CargaSnapshot
      for (const item of carga) {
        const key = item.producto as keyof typeof cargaSnapshot
        if (key in cargaSnapshot) {
          cargaSnapshot[key] = item.cargadas
        }
      }

      const totalUnidades = Object.values(cargaSnapshot).reduce((s, v) => s + v, 0)
      if (totalUnidades > 70) {
        return apiError(`Máximo 70 unidades por embarque (${totalUnidades})`, 400)
      }

      // Check weight capacity with current or new trabajador
      const targetTrabajadorId = trabajadorId || currentEmbarque.trabajadorId
      const targetTrabajador = targetTrabajadorId === currentEmbarque.trabajadorId
        ? currentEmbarque.trabajador
        : await prisma.trabajador.findUnique({ where: { id: targetTrabajadorId } })
      const capacidadKg = targetTrabajador?.capacidadKg || 500
      const pesoKg = calcularPesoDesdeCarga(cargaSnapshot)
      if (pesoKg > capacidadKg * 1.1) {
        return apiError(`Peso excede capacidad del repartidor (${pesoKg.toFixed(0)}kg > ${capacidadKg}kg)`, 400)
      }

      // Stock validation
      const { getStockDisponible, evaluarStock } = await import('@/lib/stock')
      const stockResult = await getStockDisponible()
      const stockEval = await evaluarStock(cargaSnapshot)

      if (stockEval.hasDeficit && !stockResult.tieneEstimado) {
        const MAX_OVERRIDE_PCT = 0.5
        const HARD_CAP_SIN_ESTIMADO = 30
        for (const key of ['PACA_AGUA', 'PACA_HIELO'] as const) {
          const disponible = stockEval.disponible[key]
          const maxAllowed = disponible > 0
            ? Math.floor(disponible * (1 + MAX_OVERRIDE_PCT))
            : HARD_CAP_SIN_ESTIMADO
          if (cargaSnapshot[key] > maxAllowed) {
            return apiError(`${key} excede límite de stock (${maxAllowed} máximo)`, 400)
          }
        }
      }
    }

    // Validate trabajadorId if changing
    if (trabajadorId && trabajadorId !== currentEmbarque.trabajadorId) {
      const newTrabajador = await prisma.trabajador.findUnique({
        where: { id: trabajadorId },
        select: { id: true, nombre: true, capacidadKg: true, usaMoto: true },
      })
      if (!newTrabajador) {
        return apiError('Trabajador no encontrado', 400)
      }
      if (!newTrabajador.usaMoto) {
        return apiError('Este trabajador no tiene moto asignada', 400)
      }
    }

    // Validate pedido assignment — check total units don't exceed 70
    if (pedidoIds && Array.isArray(pedidoIds) && pedidoIds.length > 0) {
      const pedidosActuales = await prisma.pedido.findMany({
        where: { embarqueId: id },
      })
      const unidadesActuales = pedidosActuales.reduce((s, p) =>
        s + (p.cPacaAguaPed || 0) + (p.cPacaHieloPed || 0) +
            (p.cBotellonFabPed || 0) + (p.cBotellonDomPed || 0) +
            (p.cBolsaAguaPed || 0) + (p.cBolsaHieloPed || 0), 0)

      const nuevosPedidos = await prisma.pedido.findMany({
        where: { id: { in: pedidoIds } },
      })
      const unidadesNuevas = nuevosPedidos.reduce((s, p) =>
        s + (p.cPacaAguaPed || 0) + (p.cPacaHieloPed || 0) +
            (p.cBotellonFabPed || 0) + (p.cBotellonDomPed || 0) +
            (p.cBolsaAguaPed || 0) + (p.cBolsaHieloPed || 0), 0)

      const totalUnidades = unidadesActuales + unidadesNuevas
      if (totalUnidades > 70) {
        return apiError(`Excede máximo de 70 unidades: ${totalUnidades} unidades (${unidadesActuales} asignadas + ${unidadesNuevas} nuevas)`, 400)
      }
    }

    const embarque = await withAdvisoryLock('EMBARQUE', async (tx) => {
      // Handle carga update — replace all EmbarqueProducto records
      if (carga && currentEmbarque.estado === 'ABIERTO') {
        await tx.embarqueProducto.deleteMany({ where: { embarqueId: id } })
        if (carga.length > 0) {
          await tx.embarqueProducto.createMany({
            data: carga.map(item => ({
              embarqueId: id,
              producto: item.producto,
              cargadas: item.cargadas,
            })),
          })
        }
      }

      // Build update data
      const updateData: Record<string, unknown> = { ...rest }
      if (obs !== undefined) updateData.obs = obs
      if (estado) updateData.estado = estado
      if (horaLlegada) updateData.horaLlegada = new Date(horaLlegada)
      if (horaSalida) updateData.horaSalida = new Date(horaSalida)
      if (trabajadorId) updateData.trabajadorId = trabajadorId
      if (rutaId !== undefined) updateData.rutaId = rutaId
      if (tipoMoto !== undefined) updateData.tipoMoto = tipoMoto
      if (baseDinero !== undefined) updateData.baseDinero = baseDinero

      // Assign pedidos if provided
      if (pedidoIds && Array.isArray(pedidoIds)) {
        await tx.pedido.updateMany({
          where: { id: { in: pedidoIds }, embarqueId: null },
          data: { embarqueId: id, estado: 'EN_RUTA' },
        })
      }

      return tx.embarque.update({
        where: { id },
        data: updateData,
        include: {
          trabajador: true,
          ruta: { select: { id: true, nombre: true } },
          pedidos: { include: { cliente: true } },
          productos: true,
        },
      })
    })

    const totalPacas = calcularPacasEmbarque(embarque.pedidos)
    const pesoKg = calcularPesoEmbarque(embarque.pedidos)
    const capacidadKg = embarque.trabajador.capacidadKg || 500
    const capacidadInfo = getCapacidadInfo(totalPacas, pesoKg, capacidadKg)

    const serialized = JSON.parse(JSON.stringify({
      ...embarque,
      totalPacas,
      pesoKg,
      capacidadKg,
      capacidadInfo,
    }))

    logAudit({
      entidad: 'Embarque',
      registroId: serialized.id,
      accion: 'UPDATE',
      datos: { numero: serialized.numero, estado: serialized.estado },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return apiSuccess({ embarque: serialized })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error updating embarque:')
    return apiError(`Error actualizando embarque: ${error instanceof Error ? error.message : 'desconocido'}`, 500)
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params

  try {
    const result = await withAdvisoryLock('EMBARQUE', async (tx: any) => {
      const embarque = await tx.embarque.findUnique({
        where: { id },
        include: { pedidos: true },
      })

      if (!embarque) {
        throw new Error('EMBARQUE_NOT_FOUND')
      }

      if (embarque.estado === 'CERRADO') {
        throw new Error('EMBARQUE_CERRADO')
      }

      // Unassign all pedidos and return them to PENDIENTE
      if (embarque.pedidos.length > 0) {
        await tx.pedido.updateMany({
          where: { embarqueId: id },
          data: { embarqueId: null, estado: 'PENDIENTE', estadoEntrega: 'PENDIENTE' },
        })
      }

      // Soft-delete by marking as CANCELADO
      return tx.embarque.update({
        where: { id },
        data: { estado: 'CANCELADO' },
      })
    })

    logAudit({
      entidad: 'Embarque',
      registroId: result.id,
      accion: 'DELETE',
      datos: { numero: result.numero, estado: 'CANCELADO' },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return apiSuccess({})
  } catch (error) {
    if (error instanceof Error && error.message === 'EMBARQUE_NOT_FOUND') {
      return apiError('Embarque no encontrado', 404)
    }
    if (error instanceof Error && error.message === 'EMBARQUE_CERRADO') {
      return apiError('No se puede cancelar un embarque cerrado', 400)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error canceling embarque:')
    return apiError('Error al cancelar embarque', 500)
  }
}
