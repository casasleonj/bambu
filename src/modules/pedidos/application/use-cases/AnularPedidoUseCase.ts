/**
 * AnularPedidoUseCase.
 */

import { getNextNumero } from '@/lib/sequence'
import { logAudit } from '@/lib/audit'
import { registrarReversionPedido } from '@/lib/receivable-entry'
import { PedidoId } from '../../domain/value-objects/PedidoId'
import type { IPedidoRepository } from '../../domain/repositories/IPedidoRepository'
import type { IFacturaRepository } from '../../domain/repositories/IFacturaRepository'
import type { INotaCreditoRepository } from '../../domain/repositories/INotaCreditoRepository'
import type { ITransactionManager, TransactionClient } from '../../infrastructure/transactions/PrismaTransactionManager'
import type { Pedido } from '../../domain/entities/Pedido'
import type { AnularPedidoInput } from '../dto'
import { PedidoDTOMapper } from '../dto/PedidoDTOMapper'

export class AnularPedidoUseCase {
  constructor(
    private pedidoRepo: IPedidoRepository,
    private facturaRepo: IFacturaRepository,
    private notaCreditoRepo: INotaCreditoRepository,
    private txManager: ITransactionManager,
  ) {}

  async execute(input: AnularPedidoInput): Promise<{ pedido: import('../dto').PedidoResumenDTO; deduped?: boolean; hijosAnulados: number; hijosIds: string[] }> {
    // FASE 0 (ADR-CONCURRENCIA-001): lock `SECUENCIA:notaCredito`. La NC se
    // genera con getNextNumero(model:'notaCredito') MAX+1, por lo que exige
    // serialización global de la numeración. Resuelve la colisión histórica
    // NC=8 vs producción=8 (keyspace fijo agotado). En FASE 8, con secuencia
    // atómica, se refina a `PEDIDO:{pedidoId}` + `SECUENCIA:notaCredito`.
    return this.txManager.executeWithLock('SECUENCIA', 'notaCredito', async (tx) => {
      const pedido = await this.pedidoRepo.findById(PedidoId.from(input.pedidoId), tx)
      if (!pedido) throw new Error('PEDIDO_NOT_FOUND')

      // FASE 1 (ADR-IDEMPOTENCIA-001): dedup por clave idempotente persistida.
      if (input.offlineId && pedido.anulacionOfflineId === input.offlineId) {
        return {
          pedido: PedidoDTOMapper.toResumen(pedido),
          deduped: true,
          hijosAnulados: 0,
          hijosIds: [],
        }
      }

      // FIX F-N21 (hallazgo 2): dedup por estado ANULADO DENTRO del
      // lock. Antes el dedup estaba en la route (fuera del lock),
      // dos requests idénticos pasaban el check y el segundo recibía
      // 400 'YA_ANULADO' en vez de un 200 idempotente. Ahora: el
      // use case retorna { deduped: true } sin hacer trabajo.
      if (pedido.estadoEntrega.get() === 'ANULADO') {
        return {
          pedido: PedidoDTOMapper.toResumen(pedido),
          deduped: true,
          hijosAnulados: 0,
          hijosIds: [],
        }
      }

      const updated = await this.aplicar(tx, pedido, 'ANULAR', input.motivo, input.offlineId)

      // Decisión PO (#367): anular un pedido anula también sus pedidos hijos
      // (`pedidoOrigenId`: entrega parcial / nueva demanda), en cascada por todo
      // el árbol y en la MISMA tx. Cada hijo sigue la regla que le corresponde
      // por estado: ENTREGADO → anular; aún no entregado → cancelar (el dominio
      // solo permite anular ENTREGADOS). Los ya ANULADO/CANCELADO se saltan.
      // La clave idempotente (offlineId) es única en BD: solo la lleva la raíz.
      const hijosIds: string[] = []
      const visitados = new Set<string>([pedido.id.get()])
      const pendientes = [pedido.id.get()]
      while (pendientes.length > 0) {
        const padreId = pendientes.shift() as string
        const hijos = await this.pedidoRepo.findMany({ pedidoOrigenId: padreId }, undefined, tx)
        for (const hijo of hijos) {
          const hijoId = hijo.id.get()
          if (visitados.has(hijoId)) continue
          visitados.add(hijoId)
          pendientes.push(hijoId)
          if (hijo.estadoEntrega.isTerminal()) continue
          const modo = hijo.puedeAnular() ? 'ANULAR' : 'CANCELAR'
          await this.aplicar(tx, hijo, modo, input.motivo ? `${input.motivo} (cascada de #${pedido.numero})` : undefined)
          hijosIds.push(hijoId)
        }
      }

      return { pedido: PedidoDTOMapper.toResumen(updated), hijosAnulados: hijosIds.length, hijosIds }
    })
  }

  /**
   * Anula (ENTREGADO) o cancela (no entregado) UN pedido dentro de la tx:
   * actualiza el pedido, compensa la cartera, anula su factura y emite la nota
   * de crédito si hubo cobros. Compartido por la raíz y por cada hijo.
   */
  private async aplicar(
    tx: TransactionClient,
    pedido: Pedido,
    modo: 'ANULAR' | 'CANCELAR',
    motivo?: string,
    offlineId?: string,
  ) {
    const { tuvoPagos, totalPagado } = modo === 'ANULAR' ? pedido.anular(offlineId) : pedido.cancelar()

    const updated = await this.pedidoRepo.update(pedido, tx)

    // ADR-CORRECCION-MONETARIA-001 D.4 (cierra F7): las filas `Pago` NO se
    // borran (hecho histórico); se compensa la proyección de cartera con una
    // `ReceivableEntry` tipo REVERSION por el neto pendiente, en la MISMA tx.
    // El helper es no-op si no hay nada proyectado (pago vía cierre/import).
    const montoRevertido = await registrarReversionPedido(tx, {
      pedidoId: pedido.id.get(),
      clienteId: pedido.clienteId,
      saldoResultante: Number(updated.saldo.toDecimal()),
    })

    // FIX H-21: la anulación de factura es parte de la misma transacción.
    await this.facturaRepo.anularByPedidoId(pedido.id.get(), tx)

    // Nota crédito si hubo cobros. FIX: usar totalPagado (lo efectivamente
    // cobrado), no updated.total que puede incluir fiado no pagado.
    if (tuvoPagos) {
      const nextNum = await getNextNumero(tx, { model: 'notaCredito' })
      await this.notaCreditoRepo.create({
        numero: `NC-${nextNum.toString().padStart(5, '0')}`,
        pedidoId: pedido.id.get(),
        monto: totalPagado,
        motivo: motivo || (modo === 'ANULAR' ? 'ANULADO' : 'CANCELADO'),
      }, tx)
    }

    await logAudit({
      entidad: 'Pedido',
      registroId: pedido.id.get(),
      accion: 'UPDATE',
      datos: { motivo, modo, notaCredito: tuvoPagos, reversion: montoRevertido },
    }, tx)

    return updated
  }
}
