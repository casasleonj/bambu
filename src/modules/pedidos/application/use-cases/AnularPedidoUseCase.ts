/**
 * AnularPedidoUseCase.
 */

import { getNextNumero } from '@/lib/sequence'
import { logAudit } from '@/lib/audit'
import { PedidoId } from '../../domain/value-objects/PedidoId'
import type { IPedidoRepository } from '../../domain/repositories/IPedidoRepository'
import type { IFacturaRepository } from '../../domain/repositories/IFacturaRepository'
import type { INotaCreditoRepository } from '../../domain/repositories/INotaCreditoRepository'
import type { ITransactionManager } from '../../infrastructure/transactions/PrismaTransactionManager'
import type { AnularPedidoInput } from '../dto'
import { PedidoDTOMapper } from '../dto/PedidoDTOMapper'

export class AnularPedidoUseCase {
  constructor(
    private pedidoRepo: IPedidoRepository,
    private facturaRepo: IFacturaRepository,
    private notaCreditoRepo: INotaCreditoRepository,
    private txManager: ITransactionManager,
  ) {}

  async execute(input: AnularPedidoInput): Promise<{ pedido: import('../dto').PedidoResumenDTO; deduped?: boolean }> {
    return this.txManager.executeWithLock('NC', async (tx) => {
      const pedido = await this.pedidoRepo.findById(PedidoId.from(input.pedidoId), tx)
      if (!pedido) throw new Error('PEDIDO_NOT_FOUND')

      // FIX F-N21 (hallazgo 2): dedup por estado ANULADO DENTRO del
      // lock. Antes el dedup estaba en la route (fuera del lock),
      // dos requests idénticos pasaban el check y el segundo recibía
      // 400 'YA_ANULADO' en vez de un 200 idempotente. Ahora: el
      // use case retorna { deduped: true } sin hacer trabajo.
      if (pedido.estadoEntrega.get() === 'ANULADO') {
        return {
          pedido: PedidoDTOMapper.toResumen(pedido),
          deduped: true,
        }
      }

      const { tuvoPagos, totalPagado } = pedido.anular()

      const updated = await this.pedidoRepo.update(pedido, tx)

      // FIX H-21: pasar tx a anularByPedidoId para mantener atomicidad.
      // Antes: la factura se anulaba en una transacción SEPARADA (auto-commit).
      // Si el rollback del outer transaction afectaba algo más, la factura
      // quedaba ANULADA con el pedido aún activo. Ahora la anulación de
      // factura es parte de la misma transacción.
      await this.facturaRepo.anularByPedidoId(pedido.id.get(), tx)

      // Create nota crédito if there were payments.
      // FIX: usar totalPagado (lo efectivamente cobrado), no updated.total
      // que puede incluir fiado no pagado.
      if (tuvoPagos) {
        const nextNum = await getNextNumero(tx, { model: 'notaCredito' })
        await this.notaCreditoRepo.create({
          numero: `NC-${nextNum.toString().padStart(5, '0')}`,
          pedidoId: pedido.id.get(),
          monto: totalPagado,
          motivo: input.motivo || 'ANULADO',
        }, tx)
      }

      logAudit({
        entidad: 'Pedido',
        registroId: pedido.id.get(),
        accion: 'UPDATE',
        datos: { motivo: input.motivo, notaCredito: tuvoPagos },
      })

      return { pedido: PedidoDTOMapper.toResumen(updated) }
    })
  }
}
