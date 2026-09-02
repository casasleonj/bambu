/**
 * CancelarPedidoUseCase.
 */

import { getNextNumero } from '@/lib/sequence'
import { logAudit } from '@/lib/audit'
import { registrarReversionPedido } from '@/lib/receivable-entry'
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
    // FASE 0 (ADR-CONCURRENCIA-001): lock `SECUENCIA:notaCredito` (paridad con
    // AnularPedidoUseCase). La NC se genera con MAX+1 → serialización global.
    return this.txManager.executeWithLock('SECUENCIA', 'notaCredito', async (tx) => {
      const pedido = await this.pedidoRepo.findById(PedidoId.from(input.pedidoId), tx)
      if (!pedido) throw new Error('PEDIDO_NOT_FOUND')

      // FASE 1 (ADR-IDEMPOTENCIA-001): dedup por clave idempotente persistida.
      if (input.offlineId && pedido.cancelacionOfflineId === input.offlineId) {
        return {
          pedido: PedidoDTOMapper.toResumen(pedido),
          deduped: true,
        }
      }

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
      const { tuvoPagos, totalPagado } = pedido.cancelar(input.offlineId)

      const updated = await this.pedidoRepo.update(pedido, tx)

      // ADR-CORRECCION-MONETARIA-001 D.4 (cierra F7): compensa la proyección de
      // cartera con una `ReceivableEntry` tipo REVERSION por el neto pendiente,
      // en la MISMA tx. No-op si no había nada proyectado.
      const montoRevertido = await registrarReversionPedido(tx, {
        pedidoId: pedido.id.get(),
        clienteId: pedido.clienteId,
        saldoResultante: Number(updated.saldo.toDecimal()),
      })

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

      await logAudit({
        entidad: 'Pedido',
        registroId: pedido.id.get(),
        accion: 'UPDATE',
        datos: { motivo: input.motivo, estado: updated.estadoEntrega.get(), notaCredito: tuvoPagos, reversion: montoRevertido },
      }, tx)

      return { pedido: PedidoDTOMapper.toResumen(updated) }
    })
  }
}
