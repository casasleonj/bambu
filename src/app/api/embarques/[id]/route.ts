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

    const { pedidoIds, obs, estado, horaLlegada, horaSalida, trabajadorId, rutaId, tipoMoto, baseDinero, carga, offlineId, ...rest } = parsed.data

    // Prevent closing via PUT — must use cierre flow (validación estática, no necesita lock)
    if (estado === 'CERRADO') {
      return apiError('Use el flujo de cierre de ruta para cerrar embarques', 400)
    }

    // FIX F-N12: TODOS los checks de estado, carga, trabajador, pedidoIds
    // se movieron DENTRO del lock EMBARQUE. Antes se hacían con
    // prisma.* (cliente global) FUERA del lock, lo que causaba TOCTOU:
    //
    // T0: Admin A lee currentEmbarque (productos=[], pedidos=[]).
    //     Valida carga de 50 unidades OK (total=50).
    // T1: Admin B añade 30 pedidos al embarque.
    // T2: Admin A entra al lock, persiste carga de 50 unidades.
    // T3: Total real: 80 unidades > 70 → excede límite operativo.
    //
    // Ahora: re-leer y re-validar DENTRO del lock usando tx.*. Si los
    // datos cambiaron entre la lectura externa y la interna, los
    // checks se ejecutan con datos frescos.
    //
    // El dedup por offlineId también se mueve adentro (antes línea 70-81):
    // si dos requests idénticos llegan, el primero persiste el offlineId,
    // el segundo lo lee dentro del lock y retorna deduped: true.
    const embarque = await withAdvisoryLock('EMBARQUE', async (tx) => {
      // Re-leer current embarque DENTRO del lock
      const currentEmbarque = await tx.embarque.findUnique({
        where: { id },
        include: { trabajador: true, productos: true },
      })
      if (!currentEmbarque) throw new Error('EMBARQUE_NOT_FOUND')

      // Offline-first: dedup
      if (offlineId && currentEmbarque.offlineId === offlineId) {
        return {
          deduped: true as const,
          embarque: {
            ...currentEmbarque,
            totalPacas: 0,
            pesoKg: 0,
            capacidadKg: currentEmbarque.trabajador.capacidadKg || 500,
            capacidadInfo: { excedeUnidades: false, excedePeso: false },
          },
        }
      }

      // Enforce field restrictions by state
      if (currentEmbarque.estado !== 'ABIERTO') {
        const forbiddenFields = ABIERTO_ONLY_FIELDS.filter((field) => parsed.data[field] !== undefined)
        if (forbiddenFields.length > 0) {
          throw new Error(`FORBIDDEN_FIELDS:${forbiddenFields.join(',')}:${currentEmbarque.estado}`)
        }
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
          throw new Error(`MAX_UNIDADES:${totalUnidades}`)
        }

        // Check weight capacity with current or new trabajador
        const targetTrabajadorId = trabajadorId || currentEmbarque.trabajadorId
        let targetTrabajador = currentEmbarque.trabajador
        if (targetTrabajadorId !== currentEmbarque.trabajadorId) {
          const fetched = await tx.trabajador.findUnique({ where: { id: targetTrabajadorId } })
          if (!fetched) throw new Error('TRABAJADOR_NOT_FOUND')
          targetTrabajador = fetched
        }
        const capacidadKg = targetTrabajador.capacidadKg || 500
        const pesoKg = calcularPesoDesdeCarga(cargaSnapshot)
        if (pesoKg > capacidadKg * 1.1) {
          throw new Error(`PESO_EXCEDIDO:${pesoKg.toFixed(0)}:${capacidadKg}`)
        }

        // Stock validation (read-only, no lock needed)
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
              throw new Error(`STOCK_EXCEDIDO:${key}:${maxAllowed}`)
            }
          }
        }
      }

      // Validate trabajadorId if changing
      if (trabajadorId && trabajadorId !== currentEmbarque.trabajadorId) {
        const newTrabajador = await tx.trabajador.findUnique({
          where: { id: trabajadorId },
          select: { id: true, nombre: true, capacidadKg: true, usaMoto: true },
        })
        if (!newTrabajador) {
          throw new Error('TRABAJADOR_NOT_FOUND')
        }
        if (!newTrabajador.usaMoto) {
          throw new Error('TRABAJADOR_SIN_MOTO')
        }
      }

      // Validate pedido assignment — check total units don't exceed 70
      if (pedidoIds && Array.isArray(pedidoIds) && pedidoIds.length > 0) {
        const pedidosActuales = await tx.pedido.findMany({
          where: { embarqueId: id },
        })
        const unidadesActuales = pedidosActuales.reduce((s: number, p: any) =>
          s + (p.cPacaAguaPed || 0) + (p.cPacaHieloPed || 0) +
              (p.cBotellonFabPed || 0) + (p.cBotellonDomPed || 0) +
              (p.cBolsaAguaPed || 0) + (p.cBolsaHieloPed || 0), 0)

        const nuevosPedidos = await tx.pedido.findMany({
          where: { id: { in: pedidoIds } },
        })
        const unidadesNuevas = nuevosPedidos.reduce((s: number, p: any) =>
          s + (p.cPacaAguaPed || 0) + (p.cPacaHieloPed || 0) +
              (p.cBotellonFabPed || 0) + (p.cBotellonDomPed || 0) +
              (p.cBolsaAguaPed || 0) + (p.cBolsaHieloPed || 0), 0)

        const totalUnidades = unidadesActuales + unidadesNuevas
        if (totalUnidades > 70) {
          throw new Error(`MAX_UNIDADES:${totalUnidades}:${unidadesActuales}:${unidadesNuevas}`)
        }
      }

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
      // Persistir offlineId para dedup en retries (offline-first)
      if (offlineId) updateData.offlineId = offlineId

      // Assign pedidos if provided
      if (pedidoIds && Array.isArray(pedidoIds)) {
        // FIX F2.5: actualizar estadoEntrega junto con estado (legacy).
        await tx.pedido.updateMany({
          where: { id: { in: pedidoIds }, embarqueId: null },
          data: { embarqueId: id, estado: 'EN_RUTA', estadoEntrega: 'EN_RUTA' },
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

    // Manejar el caso deduped: retorna el embarque pre-construido dentro del lock
    if ('deduped' in embarque && embarque.deduped) {
      logAudit({
        entidad: 'Embarque',
        registroId: embarque.embarque.id,
        accion: 'UPDATE',
        datos: { numero: embarque.embarque.numero, estado: embarque.embarque.estado, deduped: true },
        usuarioId: (authResult.user as { id?: string } | undefined)?.id,
      })
      return apiSuccess({ deduped: true, embarque: embarque.embarque })
    }

    // Caso normal: el lock retorna un embarque actualizado
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
    // Mapear errores thrown desde dentro del lock a HTTP responses
    if (error instanceof Error) {
      const msg = error.message
      if (msg === 'EMBARQUE_NOT_FOUND') return apiError('Embarque no encontrado', 404)
      if (msg === 'TRABAJADOR_NOT_FOUND') return apiError('Trabajador no encontrado', 400)
      if (msg === 'TRABAJADOR_SIN_MOTO') return apiError('Este trabajador no tiene moto asignada', 400)
      if (msg.startsWith('MAX_UNIDADES:')) return apiError(`Excede máximo de 70 unidades: ${msg.split(':')[1]}`, 400)
      if (msg.startsWith('PESO_EXCEDIDO:')) {
        const [, peso, cap] = msg.split(':')
        return apiError(`Peso excede capacidad del repartidor (${peso}kg > ${cap}kg)`, 400)
      }
      if (msg.startsWith('STOCK_EXCEDIDO:')) {
        const [, key, max] = msg.split(':')
        return apiError(`${key} excede límite de stock (${max} máximo)`, 400)
      }
      if (msg.startsWith('FORBIDDEN_FIELDS:')) {
        const [, fields, estado] = msg.split(':')
        return apiError(`No se pueden editar estos campos en estado ${estado}: ${fields}`, 400)
      }
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error updating embarque:')
    return apiError(`Error actualizando embarque: ${error instanceof Error ? error.message : 'desconocido'}`, 500)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params

  // Offline-first: leer offlineId del body (opcional, para dedup)
  let offlineId: string | undefined
  try {
    const body = await request.json().catch(() => ({}))
    if (body && typeof body === 'object' && 'offlineId' in body) {
      offlineId = (body as { offlineId?: string }).offlineId
    }
  } catch {
    // body vacío es válido
  }

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

      // Offline-first: dedup — si el embarque ya está CANCELADO, devolver OK
      // (idempotente, no se re-asignan pedidos a PENDIENTE).
      if (embarque.estado === 'CANCELADO') {
        return { deduped: true as const, embarque }
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
        data: { estado: 'CANCELADO', offlineId: offlineId || embarque.offlineId },
      })
    })

    logAudit({
      entidad: 'Embarque',
      registroId: result.id,
      accion: 'DELETE',
      datos: { numero: result.numero, estado: 'CANCELADO', deduped: 'deduped' in result ? result.deduped : false },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    if ('deduped' in result && result.deduped) {
      return apiSuccess({ deduped: true, embarque: result.embarque })
    }
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
