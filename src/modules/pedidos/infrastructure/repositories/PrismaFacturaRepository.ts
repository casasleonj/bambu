/**
 * PrismaFacturaRepository.
 */

import { prisma } from '@/lib/prisma'
import type { IFacturaRepository } from '../../domain/repositories/IFacturaRepository'
import type { FacturaSnapshot } from '../../domain/types'
import { PedidoMapper } from '../mappers/PedidoMapper'
import type { TransactionClient } from '../transactions/PrismaTransactionManager'

export class PrismaFacturaRepository implements IFacturaRepository {
  async findByPedidoId(pedidoId: string, tx?: TransactionClient): Promise<FacturaSnapshot | null> {
    const client = tx || prisma
    const raw = await client.factura.findUnique({
      where: { pedidoId },
    })
    if (!raw) return null
    return PedidoMapper.facturaSnapshotFromPrisma(raw)
  }

  async create(factura: FacturaSnapshot, pedidoId: string, clienteId: string, tx?: TransactionClient): Promise<FacturaSnapshot> {
    const client = tx || prisma
    const raw = await client.factura.create({
      data: {
        numero: factura.numero,
        clienteId,
        pedidoId,
        subtotal: factura.subtotal,
        total: factura.total,
        saldo: factura.saldo,
        estado: factura.estado,
        montoPagado: factura.montoPagado,
        empresaNombre: factura.empresaNombre,
        empresaNit: factura.empresaNit,
        empresaDireccion: factura.empresaDireccion,
        empresaTelefono: factura.empresaTelefono,
        empresaEmail: factura.empresaEmail,
      } as unknown as Parameters<typeof client.factura.create>[0]['data'],
    })
    return PedidoMapper.facturaSnapshotFromPrisma(raw)
  }

  async update(factura: FacturaSnapshot, tx?: TransactionClient): Promise<FacturaSnapshot> {
    const client = tx || prisma
    if (!factura.id) throw new Error('FacturaSnapshot.id is required for update')
    const raw = await client.factura.update({
      where: { id: factura.id },
      data: {
        total: factura.total,
        saldo: factura.saldo,
        estado: factura.estado,
        montoPagado: factura.montoPagado,
      } as unknown as Parameters<typeof client.factura.update>[0]['data'],
    })
    return PedidoMapper.facturaSnapshotFromPrisma(raw)
  }

  async anularByPedidoId(pedidoId: string, tx?: TransactionClient): Promise<void> {
    const client = tx || prisma
    await client.factura.updateMany({
      where: { pedidoId },
      data: { estado: 'ANULADA', saldo: 0 },
    })
  }
}
