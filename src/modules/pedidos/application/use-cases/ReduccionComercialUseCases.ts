/**
 * Reducción comercial aceptada (#451, ADR-REDUCCION-COMERCIAL-001).
 *
 * - `SolicitarReduccionComercialUseCase`: ADMIN y ASISTENTE registran el hecho. Si quien
 *   registra tiene el permiso `puedeAutorizarReduccionComercial` se aplica en el acto; si
 *   no, queda PENDIENTE.
 * - `ResolverReduccionComercialUseCase`: solo quien tiene el permiso autoriza (aplica) o
 *   rechaza. El rol por sí solo no alcanza.
 *
 * Ambos serializan por pedido con el lock `PEDIDO` y son idempotentes (`offlineId` al
 * solicitar; «ya resuelta → deduped» al resolver). El permiso se lee de la base, no de la sesión.
 */

import { withAdvisoryLock } from '@/lib/locks'
import { prisma } from '@/lib/prisma'
import { publishRealtimeEvent } from '@/lib/realtime'
import {
  calcularReduccion,
  decidirAplicacionReduccion,
  pedidoReducible,
  puedeAutorizarReduccion,
  puedeSolicitarReduccion,
} from '../../domain/services/reduccion-comercial.service'
import { aplicarReduccionComercial, entregadoLegacy } from '../services/aplicar-reduccion-comercial.service'

export type EstadoReduccion = 'PENDIENTE' | 'APLICADA' | 'RECHAZADA'

export interface SolicitarReduccionComercialInput {
  pedidoId: string
  producto: string
  cantidadReducida: number
  motivo: string
  aceptadoPor: string
  medio: string
  actorId: string
  offlineId?: string
}

export interface ReduccionResultado {
  id: string
  estado: EstadoReduccion
  deduped: boolean
  monto: number
  totalAntes?: number
  totalDespues?: number
  notaCreditoId?: string
}

const numOrU = (v: unknown): number | undefined => (v === null || v === undefined ? undefined : Number(v))

async function leerActor(actorId: string) {
  const u = await prisma.user.findUnique({
    where: { id: actorId },
    select: { rol: true, activo: true, puedeAutorizarReduccionComercial: true },
  })
  if (!u) throw new Error('FORBIDDEN: usuario no encontrado.')
  return u
}

export class SolicitarReduccionComercialUseCase {
  async execute(input: SolicitarReduccionComercialInput): Promise<ReduccionResultado> {
    const actor = await leerActor(input.actorId)
    if (!actor.activo || !puedeSolicitarReduccion(actor.rol)) {
      throw new Error('FORBIDDEN: solo ADMIN y ASISTENTE pueden registrar una reducción comercial.')
    }
    const motivo = input.motivo.trim()
    if (motivo.length < 3) throw new Error('MOTIVO_REQUERIDO: indica por qué se reduce el pedido.')
    const aceptadoPor = input.aceptadoPor.trim()
    if (aceptadoPor.length < 2) throw new Error('CONSENTIMIENTO_REQUERIDO: indica quién del lado del cliente aceptó la reducción.')

    const r = await withAdvisoryLock('PEDIDO', input.pedidoId, async (tx) => {
      if (input.offlineId) {
        const previa = await tx.pedidoReduccionComercial.findUnique({ where: { offlineId: input.offlineId } })
        if (previa) {
          return {
            id: previa.id,
            estado: previa.estado as EstadoReduccion,
            deduped: true,
            monto: Number(previa.monto),
            totalAntes: numOrU(previa.totalAntes),
            totalDespues: numOrU(previa.totalDespues),
            notaCreditoId: previa.notaCreditoId ?? undefined,
          }
        }
      }

      const pedido = await tx.pedido.findUnique({ where: { id: input.pedidoId }, include: { items: true } })
      if (!pedido) throw new Error('PEDIDO_NOT_FOUND')
      if (!pedidoReducible(pedido.estadoEntrega, pedido.estado)) {
        throw new Error('PEDIDO_NO_REDUCIBLE: el pedido está cancelado o anulado.')
      }
      const item = pedido.items.find((i) => i.producto === input.producto)
      if (!item) throw new Error('LINEA_NO_ENCONTRADA: el pedido no tiene ese producto.')

      const pendiente = await tx.pedidoReduccionComercial.findFirst({
        where: { pedidoId: pedido.id, producto: input.producto, estado: 'PENDIENTE' },
        select: { id: true },
      })
      if (pendiente) {
        throw new Error('REDUCCION_PENDIENTE: ya hay una reducción pendiente para esta línea.')
      }

      // Valida (entregado, sobrepago, pedido vacío…) desde la solicitud: no se encola algo que no se podrá aplicar.
      const calculo = calcularReduccion({
        total: Number(pedido.total),
        totalPagado: Number(pedido.totalPagado),
        cantPedido: item.cantPedido,
        cantEntrega: Math.max(item.cantEntrega, entregadoLegacy(pedido, input.producto)),
        precio: Number(item.precio),
        cantidadReducida: input.cantidadReducida,
        unidadesOtrasLineas: pedido.items.filter((i) => i.id !== item.id).reduce((s, i) => s + i.cantPedido, 0),
      })

      const creada = await tx.pedidoReduccionComercial.create({
        data: {
          pedidoId: pedido.id,
          producto: input.producto,
          cantidadReducida: input.cantidadReducida,
          cantPedidoAntes: item.cantPedido,
          cantPedidoDespues: calculo.cantPedidoNueva,
          precio: Number(item.precio),
          monto: calculo.monto,
          motivo,
          aceptadoPor,
          medio: input.medio,
          solicitadoPorId: input.actorId,
          offlineId: input.offlineId ?? null,
        },
      })

      if (decidirAplicacionReduccion(actor) === 'APLICAR') {
        const ap = await aplicarReduccionComercial(tx, { reduccionId: creada.id, actorId: input.actorId })
        return {
          id: creada.id,
          estado: 'APLICADA' as const,
          deduped: false,
          monto: calculo.monto,
          totalAntes: ap.totalAntes,
          totalDespues: ap.totalDespues,
          notaCreditoId: ap.notaCreditoId,
        }
      }
      return { id: creada.id, estado: 'PENDIENTE' as const, deduped: false, monto: calculo.monto }
    })

    if (!r.deduped && r.estado === 'APLICADA') void publishRealtimeEvent('pedido.updated', input.pedidoId).catch(() => {})
    return r
  }
}

export interface ResolverReduccionComercialInput {
  reduccionId: string
  resolucion: 'AUTORIZAR' | 'RECHAZAR'
  actorId: string
  nota?: string
}

export class ResolverReduccionComercialUseCase {
  async execute(input: ResolverReduccionComercialInput): Promise<ReduccionResultado> {
    const actor = await leerActor(input.actorId)
    if (!puedeAutorizarReduccion(actor)) {
      throw new Error('FORBIDDEN: no tienes el permiso para autorizar o rechazar una reducción comercial.')
    }
    const previa = await prisma.pedidoReduccionComercial.findUnique({
      where: { id: input.reduccionId },
      select: { pedidoId: true },
    })
    if (!previa) throw new Error('REDUCCION_NOT_FOUND')

    const r = await withAdvisoryLock('PEDIDO', previa.pedidoId, async (tx) => {
      const c = await tx.pedidoReduccionComercial.findUniqueOrThrow({ where: { id: input.reduccionId } })
      if (c.estado !== 'PENDIENTE') {
        return {
          id: c.id,
          estado: c.estado as EstadoReduccion,
          deduped: true,
          monto: Number(c.monto),
          totalAntes: numOrU(c.totalAntes),
          totalDespues: numOrU(c.totalDespues),
          notaCreditoId: c.notaCreditoId ?? undefined,
        }
      }
      if (input.resolucion === 'RECHAZAR') {
        await tx.pedidoReduccionComercial.update({
          where: { id: c.id },
          data: { estado: 'RECHAZADA', resueltoPorId: input.actorId, resueltoAt: new Date(), notaResolucion: input.nota ?? null },
        })
        return { id: c.id, estado: 'RECHAZADA' as const, deduped: false, monto: Number(c.monto) }
      }
      const ap = await aplicarReduccionComercial(tx, { reduccionId: c.id, actorId: input.actorId, nota: input.nota })
      return {
        id: c.id,
        estado: 'APLICADA' as const,
        deduped: false,
        monto: Number(c.monto),
        totalAntes: ap.totalAntes,
        totalDespues: ap.totalDespues,
        notaCreditoId: ap.notaCreditoId,
      }
    })

    if (!r.deduped && r.estado === 'APLICADA') void publishRealtimeEvent('pedido.updated', previa.pedidoId).catch(() => {})
    return r
  }
}
