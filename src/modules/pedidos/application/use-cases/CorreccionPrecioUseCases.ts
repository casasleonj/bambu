/**
 * Corrección de precio de una línea del pedido (ADR-MONETARIO-002 §1, ADR-CIERRE-004).
 *
 * - `SolicitarCorreccionPrecioUseCase`: ADMIN y ASISTENTE registran. Si la registra un
 *   ADMIN se aplica en el acto; si la registra un ASISTENTE queda PENDIENTE.
 * - `ResolverCorreccionPrecioUseCase`: solo ADMIN autoriza (aplica) o rechaza.
 *
 * Ambos serializan por pedido con el lock `PEDIDO` y son idempotentes (`offlineId` al
 * solicitar; «ya resuelta → deduped» al resolver).
 */

import { withAdvisoryLock } from '@/lib/locks'
import { prisma } from '@/lib/prisma'
import { publishRealtimeEvent } from '@/lib/realtime'
import {
  calcularCorreccion,
  decidirAplicacion,
  esPrecioRaro,
  pedidoCorregible,
  puedeResolverCorreccion,
  puedeSolicitarCorreccion,
} from '../../domain/services/correccion-precio.service'
import { aplicarCorreccionPrecio } from '../services/aplicar-correccion-precio.service'
import { validarExcedenteAcreditable } from '../services/saldo-favor-excedente.service'

export type EstadoCorreccion = 'PENDIENTE' | 'APLICADA' | 'RECHAZADA'

export interface SolicitarCorreccionPrecioInput {
  pedidoId: string
  producto: string
  precioNuevo: number
  motivo: string
  actorId: string
  actorRol: string
  offlineId?: string
}

export interface CorreccionResultado {
  id: string
  estado: EstadoCorreccion
  precioRaro: boolean
  deduped: boolean
  totalAntes?: number
  totalDespues?: number
  /** Lo pagado de más que pasó a saldo a favor del cliente (#533). */
  excedenteAcreditado?: number
  /** Crédito de este pedido que se reaplicó al subir el total. */
  creditoReaplicado?: number
}

export class SolicitarCorreccionPrecioUseCase {
  async execute(input: SolicitarCorreccionPrecioInput): Promise<CorreccionResultado> {
    if (!puedeSolicitarCorreccion(input.actorRol)) {
      throw new Error('FORBIDDEN: solo ADMIN y ASISTENTE pueden corregir un precio.')
    }
    const motivo = input.motivo.trim()
    if (motivo.length < 3) throw new Error('MOTIVO_REQUERIDO: indica por qué se corrige el precio.')

    const r = await withAdvisoryLock('PEDIDO', input.pedidoId, async (tx) => {
      if (input.offlineId) {
        const previa = await tx.pedidoCorreccionPrecio.findUnique({ where: { offlineId: input.offlineId } })
        if (previa) {
          return {
            id: previa.id,
            estado: previa.estado as EstadoCorreccion,
            precioRaro: previa.precioRaro,
            deduped: true,
            totalAntes: previa.totalAntes === null ? undefined : Number(previa.totalAntes),
            totalDespues: previa.totalDespues === null ? undefined : Number(previa.totalDespues),
          }
        }
      }

      const pedido = await tx.pedido.findUnique({
        where: { id: input.pedidoId },
        include: { items: true },
      })
      if (!pedido) throw new Error('PEDIDO_NOT_FOUND')
      if (!pedidoCorregible(pedido.estadoEntrega, pedido.estado)) {
        throw new Error('PEDIDO_NO_CORREGIBLE: el pedido está cancelado o anulado.')
      }
      const item = pedido.items.find((i) => i.producto === input.producto)
      if (!item) throw new Error('LINEA_NO_ENCONTRADA: el pedido no tiene ese producto.')

      const pendiente = await tx.pedidoCorreccionPrecio.findFirst({
        where: { pedidoId: pedido.id, producto: input.producto, estado: 'PENDIENTE' },
        select: { id: true },
      })
      if (pendiente) {
        throw new Error('CORRECCION_PENDIENTE: ya hay una corrección de precio pendiente para esta línea.')
      }

      const precioAnterior = Number(item.precio)
      // Valida (precio, excedente…) desde la solicitud: no se encola algo que no se podrá aplicar.
      const calculo = calcularCorreccion({
        total: Number(pedido.total),
        totalPagado: Number(pedido.totalPagado),
        cantidad: item.cantPedido,
        precioAnterior,
        precioNuevo: input.precioNuevo,
      })
      await validarExcedenteAcreditable(tx, {
        pedidoId: pedido.id, clienteId: pedido.clienteId, excedente: calculo.excedente, totalPagadoAntes: Number(pedido.totalPagado),
      })

      const creada = await tx.pedidoCorreccionPrecio.create({
        data: {
          pedidoId: pedido.id,
          producto: input.producto,
          cantidad: item.cantPedido,
          precioAnterior,
          precioNuevo: input.precioNuevo,
          delta: calculo.delta,
          precioRaro: esPrecioRaro(input.producto, input.precioNuevo),
          motivo,
          solicitadoPorId: input.actorId,
          offlineId: input.offlineId ?? null,
        },
      })

      if (decidirAplicacion(input.actorRol) === 'APLICAR') {
        const ap = await aplicarCorreccionPrecio(tx, { correccionId: creada.id, actorId: input.actorId })
        return {
          id: creada.id,
          estado: 'APLICADA' as const,
          precioRaro: creada.precioRaro,
          deduped: false,
          totalAntes: ap.totalAntes,
          totalDespues: ap.totalDespues,
          excedenteAcreditado: ap.excedenteAcreditado,
          creditoReaplicado: ap.creditoReaplicado,
        }
      }
      return { id: creada.id, estado: 'PENDIENTE' as const, precioRaro: creada.precioRaro, deduped: false }
    })

    if (!r.deduped && r.estado === 'APLICADA') void publishRealtimeEvent('pedido.updated', input.pedidoId).catch(() => {})
    return r
  }
}

export interface ResolverCorreccionPrecioInput {
  correccionId: string
  resolucion: 'AUTORIZAR' | 'RECHAZAR'
  actorId: string
  actorRol: string
  nota?: string
}

export class ResolverCorreccionPrecioUseCase {
  async execute(input: ResolverCorreccionPrecioInput): Promise<CorreccionResultado> {
    if (!puedeResolverCorreccion(input.actorRol)) {
      throw new Error('FORBIDDEN: solo un ADMIN autoriza o rechaza una corrección de precio.')
    }
    const previa = await prisma.pedidoCorreccionPrecio.findUnique({
      where: { id: input.correccionId },
      select: { pedidoId: true },
    })
    if (!previa) throw new Error('CORRECCION_NOT_FOUND')

    const r = await withAdvisoryLock('PEDIDO', previa.pedidoId, async (tx) => {
      const c = await tx.pedidoCorreccionPrecio.findUniqueOrThrow({ where: { id: input.correccionId } })
      if (c.estado !== 'PENDIENTE') {
        return {
          id: c.id,
          estado: c.estado as EstadoCorreccion,
          precioRaro: c.precioRaro,
          deduped: true,
          totalAntes: c.totalAntes === null ? undefined : Number(c.totalAntes),
          totalDespues: c.totalDespues === null ? undefined : Number(c.totalDespues),
        }
      }
      if (input.resolucion === 'RECHAZAR') {
        await tx.pedidoCorreccionPrecio.update({
          where: { id: c.id },
          data: { estado: 'RECHAZADA', resueltoPorId: input.actorId, resueltoAt: new Date(), notaResolucion: input.nota ?? null },
        })
        return { id: c.id, estado: 'RECHAZADA' as const, precioRaro: c.precioRaro, deduped: false }
      }
      const ap = await aplicarCorreccionPrecio(tx, { correccionId: c.id, actorId: input.actorId, nota: input.nota })
      return {
        id: c.id,
        estado: 'APLICADA' as const,
        precioRaro: c.precioRaro,
        deduped: false,
        totalAntes: ap.totalAntes,
        totalDespues: ap.totalDespues,
        excedenteAcreditado: ap.excedenteAcreditado,
        creditoReaplicado: ap.creditoReaplicado,
      }
    })

    if (!r.deduped && r.estado === 'APLICADA') void publishRealtimeEvent('pedido.updated', previa.pedidoId).catch(() => {})
    return r
  }
}
