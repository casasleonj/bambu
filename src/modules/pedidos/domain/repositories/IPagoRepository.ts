/**
 * IPagoRepository — Domain Port.
 *
 * Contract for Pago persistence.
 */

import type { PagoData } from '../types'
import type { TransactionClient } from '../../infrastructure/transactions/PrismaTransactionManager'

export interface IPagoRepository {
  findByPedidoId(pedidoId: string, tx?: TransactionClient): Promise<PagoData[]>
  /**
   * @param metodosRequieren — lista ya resuelta de métodos que nacen REPORTADO
   *   (ADR-PAGO-REPORTADO-CONFIRMADO-001 §2). Si se omite, el repo la lee de
   *   Config (una lectura extra dentro de la tx — pasarla evita el round-trip).
   */
  createMany(
    pedidoId: string,
    pagos: PagoData[],
    tx?: TransactionClient,
    metodosRequieren?: string[],
    /**
     * ADR-PAGO-EMBARQUE-CAPTURA-001: embarque de captura del pago. `null` =
     * pago fuera de misión. Se aplica a todos los `pagos` del batch.
     */
    embarqueId?: string | null,
  ): Promise<void>
}
