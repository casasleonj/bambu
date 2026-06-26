/**
 * PrismaPedidoRepository.
 *
 * Implements IPedidoRepository using Prisma.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { startOfDayBogota, endOfDayBogota } from '@/lib/dates'
import { Pedido } from '../../domain/entities/Pedido'
import { PedidoId } from '../../domain/value-objects/PedidoId'
import type { IPedidoRepository, PedidoFilter } from '../../domain/repositories/IPedidoRepository'
import { PedidoMapper } from '../mappers/PedidoMapper'
import type { TransactionClient } from '../transactions/PrismaTransactionManager'

export class PrismaPedidoRepository implements IPedidoRepository {
  async findById(id: PedidoId, tx?: TransactionClient): Promise<Pedido | null> {
    const client = tx || prisma
    const raw = await client.pedido.findUnique({
      where: { id: id.get() },
      include: { items: true, pagos: true },
    })
    if (!raw) return null
    return PedidoMapper.fromPrisma(raw as unknown as Parameters<typeof PedidoMapper.fromPrisma>[0])
  }

  async findByNumero(numero: number, tx?: TransactionClient): Promise<Pedido | null> {
    const client = tx || prisma
    const raw = await client.pedido.findFirst({
      where: { numero },
      include: { items: true, pagos: true },
    })
    if (!raw) return null
    return PedidoMapper.fromPrisma(raw as unknown as Parameters<typeof PedidoMapper.fromPrisma>[0])
  }

  // FIX F-N10: búsqueda por offlineId para dedup offline-first.
  // El índice Pedido.offlineId @unique garantiza que la búsqueda es O(1).
  // Usado en CrearPedidoUseCase.execute() para detectar reenvíos
  // de requests offline antes de hacer trabajo wasted.
  async findByOfflineId(offlineId: string, tx?: TransactionClient): Promise<Pedido | null> {
    const client = tx || prisma
    const raw = await client.pedido.findUnique({
      where: { offlineId },
      include: { items: true, pagos: true },
    })
    if (!raw) return null
    return PedidoMapper.fromPrisma(raw as unknown as Parameters<typeof PedidoMapper.fromPrisma>[0])
  }

  async findMany(
    filter?: PedidoFilter,
    options?: { take?: number; skip?: number; orderBy?: 'asc' | 'desc' },
    tx?: TransactionClient,
  ): Promise<Pedido[]> {
    const client = tx || prisma
    const where = this.buildWhere(filter)
    const raw = await client.pedido.findMany({
      where,
      orderBy: { numero: options?.orderBy ?? 'desc' },
      take: options?.take,
      skip: options?.skip,
      include: { items: true, pagos: true },
    })
    return raw.map(r => PedidoMapper.fromPrisma(r as unknown as Parameters<typeof PedidoMapper.fromPrisma>[0]))
  }

  async count(filter?: PedidoFilter, tx?: TransactionClient): Promise<number> {
    const client = tx || prisma
    const where = this.buildWhere(filter)
    return client.pedido.count({ where })
  }

  async save(pedido: Pedido, tx?: TransactionClient, options?: { offlineId?: string }): Promise<Pedido> {
    const client = tx || prisma
    const data = PedidoMapper.toPrismaCreate(pedido)
    // Offline-first: si viene offlineId, se persiste para dedup al reenviar
    if (options?.offlineId) {
      data.offlineId = options.offlineId
    }
    const raw = await client.pedido.create({
      data: data as unknown as Parameters<typeof client.pedido.create>[0]['data'],
      include: { items: true, pagos: true },
    })
    return PedidoMapper.fromPrisma(raw as unknown as Parameters<typeof PedidoMapper.fromPrisma>[0])
  }

  async update(pedido: Pedido, tx?: TransactionClient): Promise<Pedido> {
    const client = tx || prisma
    const data = PedidoMapper.toPrismaUpdate(pedido)

    await client.pedidoItem.deleteMany({ where: { pedidoId: pedido.id.get() } })

    const raw = await client.pedido.update({
      where: { id: pedido.id.get() },
      data: {
        ...(data as unknown as Prisma.PedidoUpdateInput),
        items: {
          create: PedidoMapper.toPrismaItemsCreate(pedido) as unknown as Prisma.PedidoItemCreateWithoutPedidoInput[],
        },
      } as unknown as Prisma.PedidoUpdateInput,
      include: { items: true, pagos: true },
    })

    return PedidoMapper.fromPrisma(raw as unknown as Parameters<typeof PedidoMapper.fromPrisma>[0])
  }

  async findPendingByCliente(
    clienteId: string,
    tx?: TransactionClient,
  ): Promise<Array<{ id: string; numero: number; saldo: number }>> {
    const client = tx || prisma
    // FIX C-FIADOS-1: solo pedidos ENTREGADOS con saldo > 0 cuentan para el
    // límite de fiados. Pedidos PENDIENTE/EN_RUTA/NO_ENTREGADO no generan
    // deuda real hasta ser entregados.
    const raw = await client.pedido.findMany({
      where: {
        clienteId,
        estadoEntrega: 'ENTREGADO',
        saldo: { gt: 0 },
        estadoPago: { notIn: ['PAGADO', 'ANTICIPADO', 'ANULADO'] },
      },
      orderBy: { numero: 'asc' },
      select: { id: true, numero: true, saldo: true },
    })
    return raw.map(r => ({
      id: r.id,
      numero: r.numero,
      saldo: typeof r.saldo === 'number' ? r.saldo : (r.saldo as { toNumber: () => number }).toNumber(),
    }))
  }

  async countByClienteAndDate(clienteId: string, date: Date, tx?: TransactionClient): Promise<number> {
    const client = tx || prisma
    // FIX Fase 2 §3.3: antes usaba setHours(0,0,0,0) naive (UTC en Vercel),
    // corriendo la query 5h. Ahora: zona Bogotá explícita.
    const dateStr = date.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const start = startOfDayBogota(dateStr)
    const end = endOfDayBogota(dateStr)
    return client.pedido.count({
      where: {
        clienteId,
        fecha: { gte: start, lt: end },
      },
    })
  }

  private buildWhere(filter?: PedidoFilter): Record<string, unknown> {
    const where: Record<string, unknown> = {}
    if (filter?.clienteId) where.clienteId = filter.clienteId
    if (filter?.embarqueId !== undefined) where.embarqueId = filter.embarqueId
    if (filter?.estadoEntrega) where.estadoEntrega = filter.estadoEntrega
    if (filter?.estadoPago) where.estadoPago = filter.estadoPago
    if (filter?.origen) where.origen = filter.origen
    if (filter?.desde || filter?.hasta) {
      where.fecha = {}
      if (filter.desde) (where.fecha as Record<string, Date>).gte = filter.desde
      if (filter.hasta) (where.fecha as Record<string, Date>).lt = filter.hasta
    }
    return where
  }
}
