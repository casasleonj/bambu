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

  async execute(input: CancelarPedidoInput): Promise<{ pedido: import('../dto').PedidoResumenDTO; deduped?: boolean }> {
    return this.txManager.executeWithLock('NC', async (tx) => {
      const pedido = await this.pedidoRepo.findById(PedidoId.from(input.pedidoId), tx)
      if (!pedido) throw new Error('PEDIDO_NOT_FOUND')

      // FIX: dedup por estado CANCELADO DENTRO del lock. Paridad con
      // AnularPedidoUseCase (F-N21): si ya está cancelado, retornar
      // idempotente en vez de re-ejecutar el flujo de NC/factura.
      if (pedido.estadoEntrega.get() === 'CANCELADO') {
        return {
          pedido: PedidoDTOMapper.toResumen(pedido),
          deduped: true,
        }
      }

      // FIX CRITICAL (C-BIZ-1): cancelar() now returns tuvoPagos and totalPagado.
      // Previously, pedido.total was reset to 0 inside cancelar(), causing the NC
      // to be created with monto=0 (customer lost refund silently).
      const { tuvoPagos, totalPagado } = pedido.cancelar()

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

      // Create nota crédito if there were payments.
      // FIX: usar totalPagado (lo efectivamente cobrado), no totalOriginal
      // que puede incluir fiado no pagado.
      if (tuvoPagos) {
        const nextNum = await getNextNumero(tx, { model: 'notaCredito' })
        await this.notaCreditoRepo.create({
          numero: `NC-${nextNum.toString().padStart(5, '0')}`,
          pedidoId: pedido.id.get(),
          monto: totalPagado,
          motivo: input.motivo || 'CANCELADO',
        }, tx)
      }

      logAudit({
        entidad: 'Pedido',
        registroId: pedido.id.get(),
        accion: 'UPDATE',
        datos: { motivo: input.motivo, estado: updated.estadoEntrega.get(), notaCredito: tuvoPagos },
      })

      return { pedido: PedidoDTOMapper.toResumen(updated) }
    })
  }
}
