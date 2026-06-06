/**
 * CancelarPedidoUseCase.
 */

import { getNextNumero } from '@/lib/sequence'
import { logAudit } from '@/lib/audit'
import { PedidoId } from '../../domain/value-objects/PedidoId'
import type { IPedidoRepository } from '../../domain/repositories/IPedidoRepository'
import type { IFacturaRepository } from '../../domain/repositories/IFacturaRepository'
import type { INotaCreditoRepository } from '../../domain/repositories/INotaCreditoRepository'
import type { ITransactionManager } from '../../infrastructure/transactions/PrismaTransactionManager'
import type { CancelarPedidoInput } from '../dto'
import { PedidoDTOMapper } from '../dto/PedidoDTOMapper'

export class CancelarPedidoUseCase {
  constructor(
    private pedidoRepo: IPedidoRepository,
    private facturaRepo: IFacturaRepository,
    private notaCreditoRepo: INotaCreditoRepository,
    private txManager: ITransactionManager,
  ) {}

  async execute(input: CancelarPedidoInput) {
    return this.txManager.execute(async (tx) => {
      const pedido = await this.pedidoRepo.findById(PedidoId.from(input.pedidoId), tx)
      if (!pedido) throw new Error('PEDIDO_NOT_FOUND')

      const tuvoPagos = pedido.cancelar()

      const updated = await this.pedidoRepo.update(pedido, tx)

      // Anular factura (DENTRO de la tx)
      // FIX F-N8: pasar `tx` como 2do arg para que la anulación de la
      // factura sea parte de la MISMA transacción que el update del
      // pedido y la creación de la NC. Antes, la factura se anulaba
      // en una tx separada (porque `tx` era undefined y se usaba el
      // cliente global). Si la tx outer hacía rollback (error de red,
      // P2034 en Serializable, validación posterior), la factura YA
      // estaba anulada → estado inconsistente: pedido activo, factura
      // anulada, NC creada.
      await this.facturaRepo.anularByPedidoId(pedido.id.get(), tx)

      // Create nota crédito if there were payments
      if (tuvoPagos) {
        const nextNum = await getNextNumero(tx, { model: 'notaCredito' })
        await this.notaCreditoRepo.create({
          numero: `NC-${nextNum.toString().padStart(5, '0')}`,
          pedidoId: pedido.id.get(),
          monto: updated.total.toDecimal(),
          motivo: 'CANCELADO',
        }, tx)
      }

      logAudit({
        entidad: 'Pedido',
        registroId: pedido.id.get(),
        accion: 'UPDATE',
        datos: { estado: updated.estadoEntrega.get() },
      })

      return { pedido: PedidoDTOMapper.toResumen(updated) }
    })
  }
}
