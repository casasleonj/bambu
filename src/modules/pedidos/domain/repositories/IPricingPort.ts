/**
 * IPricingPort — Domain Port.
 *
 * Contract for price resolution. The infrastructure layer implements this
 * by fetching tiers, product configs, and client overrides from the database.
 */

import type { ProductCode } from '@/shared/domain'
import type { Canal, ItemPedidoResuelto, PrecioTier } from '../types'

export interface ProductoPricingConfig {
  aplicaDomicilio: boolean
  sobreCostoDomicilio: number
  precioBase: number
}

export interface PricingData {
  clienteOverrides: Record<string, number> | null
  tiersByCode: Record<string, PrecioTier[]>
  productosByCode: Record<string, ProductoPricingConfig>
}

import type { TransactionClient } from '../../infrastructure/transactions/PrismaTransactionManager'

export interface IPricingPort {
  /**
   * Load all pricing data needed to resolve prices for a set of items.
   */
  loadPricingContext(
    clienteId: string | undefined,
    negocioId: string | null | undefined,
    activeCodes: ProductCode[],
    tx?: TransactionClient,
  ): Promise<PricingData>

  /**
   * Resolve prices using the pure algorithm + loaded data.
   */
  resolverPrecios(
    items: Array<{ codigo: ProductCode; cantidad: number; precioManual?: number }>,
    canal: Canal,
    pricingData: PricingData,
  ): Promise<ItemPedidoResuelto[]>
}
