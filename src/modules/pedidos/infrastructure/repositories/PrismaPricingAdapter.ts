/**
 * PrismaPricingAdapter.
 *
 * Implements IPricingPort by loading data from Prisma and delegating
 * to the pure pricing algorithm domain service.
 */

import { prisma } from '@/lib/prisma'
import type { ProductCode } from '@/shared/domain'
import type { Canal, ItemPedidoResuelto, PrecioTier } from '../../domain/types'
import type { IPricingPort, ProductoPricingConfig, PricingData } from '../../domain/repositories/IPricingPort'
import { resolverPreciosPedido } from '../../domain/services/pricing-algorithm.service'
import type { TransactionClient } from '../transactions/PrismaTransactionManager'

export class PrismaPricingAdapter implements IPricingPort {
  async loadPricingContext(
    clienteId: string | undefined,
    negocioId: string | null | undefined,
    activeCodes: ProductCode[],
    tx?: TransactionClient,
  ): Promise<PricingData> {
    const client = tx || prisma

    // 1. Load client/negocio overrides
    let clienteOverrides: Record<string, number> | null = null
    if (clienteId) {
      if (negocioId) {
        const negocio = await client.negocio.findUnique({
          where: { id: negocioId },
          select: { preciosEspeciales: true },
        })
        if (negocio?.preciosEspeciales) {
          try {
            clienteOverrides = JSON.parse(negocio.preciosEspeciales)
          } catch { /* ignore invalid JSON */ }
        }
      }
      if (!clienteOverrides) {
        const cliente = await client.cliente.findUnique({
          where: { id: clienteId },
          select: { preciosEspeciales: true },
        })
        if (cliente?.preciosEspeciales) {
          try {
            clienteOverrides = JSON.parse(cliente.preciosEspeciales)
          } catch { /* ignore invalid JSON */ }
        }
      }
    }

    // 2. Batch load tiers and product configs
    let tiersByCode: Record<string, PrecioTier[]> = {}
    let productosByCode: Record<string, ProductoPricingConfig> = {}

    if (activeCodes.length > 0) {
      const [allTiers, allProductos] = await Promise.all([
        client.precioVolumen.findMany({
          where: {
            producto: { codigo: { in: activeCodes } },
            activo: true,
          },
          include: { producto: true },
          orderBy: [{ producto: { codigo: 'asc' } }, { cantMin: 'asc' }],
        }),
        client.producto.findMany({
          where: { codigo: { in: activeCodes } },
          select: {
            codigo: true,
            aplicaDomicilio: true,
            sobreCostoDomicilio: true,
            precioBase: true,
          },
        }),
      ])

      for (const tier of allTiers) {
        const code = (tier.producto as { codigo: string }).codigo
        if (!tiersByCode[code]) tiersByCode[code] = []
        tiersByCode[code].push({
          cantMin: tier.cantMin,
          cantMax: tier.cantMax,
          precio: typeof tier.precio === 'number' ? tier.precio : (tier.precio as { toNumber: () => number }).toNumber(),
        })
      }

      for (const prod of allProductos) {
        productosByCode[prod.codigo] = {
          aplicaDomicilio: prod.aplicaDomicilio,
          sobreCostoDomicilio: typeof prod.sobreCostoDomicilio === 'number'
            ? prod.sobreCostoDomicilio
            : (prod.sobreCostoDomicilio as { toNumber: () => number }).toNumber(),
          precioBase: typeof prod.precioBase === 'number'
            ? prod.precioBase
            : (prod.precioBase as { toNumber: () => number }).toNumber(),
        }
      }
    }

    return { clienteOverrides, tiersByCode, productosByCode }
  }

  async resolverPrecios(
    items: Array<{ codigo: ProductCode; cantidad: number; precioManual?: number }>,
    canal: Canal,
    pricingData: PricingData,
  ): Promise<ItemPedidoResuelto[]> {
    return resolverPreciosPedido({
      items,
      canal,
      clienteOverrides: pricingData.clienteOverrides,
      tiersByCode: pricingData.tiersByCode,
      productosByCode: pricingData.productosByCode,
    })
  }
}
