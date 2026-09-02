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
  ): Promise<void>
}
