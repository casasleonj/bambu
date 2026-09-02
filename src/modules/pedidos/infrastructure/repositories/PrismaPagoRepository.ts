/**
 * PrismaPagoRepository.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { datosConfirmacionInicial, leerMetodosRequierenConfirmacion } from '@/lib/pago-confirmacion'
import type { IPagoRepository } from '../../domain/repositories/IPagoRepository'
import type { PagoData } from '../../domain/types'
import type { TransactionClient } from '../transactions/PrismaTransactionManager'

export class PrismaPagoRepository implements IPagoRepository {
  async findByPedidoId(pedidoId: string, tx?: TransactionClient): Promise<PagoData[]> {
    const client = tx || prisma
    const raw = await client.pago.findMany({
      where: { pedidoId },
    })
    return raw.map(p => ({
      metodo: p.metodo as PagoData['metodo'],
      monto: typeof p.monto === 'number' ? p.monto : (p.monto as { toNumber: () => number }).toNumber(),
    }))
  }

  async createMany(pedidoId: string, pagos: PagoData[], tx?: TransactionClient): Promise<void> {
    const client = tx || prisma
    if (pagos.length === 0) return
    // ADR-PAGO-REPORTADO-CONFIRMADO-001 §2: clasificación inicial por método,
    // con override configurable (`Config.METODOS_REQUIEREN_CONFIRMACION`).
    const metodosConfirmacion = await leerMetodosRequierenConfirmacion(client)
    await client.pago.createMany({
      data: pagos.map(p => ({
        pedidoId,
        metodo: p.metodo,
        monto: p.monto,
        ...datosConfirmacionInicial(p.metodo, metodosConfirmacion),
      })) as unknown as Prisma.PagoCreateManyInput[],
    })
  }
}
