/**
 * Pricing Algorithm Domain Service.
 *
 * Pure price resolution logic. No database access.
 * Receives pre-loaded data (tiers, product configs, client overrides) and computes final prices.
 *
 * This is the extracted business logic from `lib/pricing.ts` with all Prisma queries removed.
 */

import type { ProductCode } from '@/shared/domain'
import type { Canal } from '../types'
import type { ItemPedidoResuelto, PrecioTier } from '../types'

export interface ProductoConfig {
  aplicaDomicilio: boolean
  sobreCostoDomicilio: number
  precioBase: number
}

export interface PricingContext {
  items: Array<{ codigo: ProductCode; cantidad: number; precioManual?: number }>
  canal: Canal
  clienteOverrides: Record<string, number> | null
  tiersByCode: Record<string, PrecioTier[]>
  productosByCode: Record<string, ProductoConfig>
}

/**
 * Parses special prices JSON into a per-channel map.
 * Supports format: {"DOMICILIO":{"PACA_AGUA":6000},"PUNTO":{...}}
 * And legacy: {"PACA_AGUA":6000} → applied to both channels.
 */
export function parsePreciosEspeciales(
  json: string | null | undefined,
): Record<Canal, Record<string, number>> {
  const empty: Record<Canal, Record<string, number>> = { DOMICILIO: {}, PUNTO: {} }
  if (!json) return empty

  try {
    const parsed = JSON.parse(json)
    if (parsed.DOMICILIO || parsed.PUNTO) {
      return {
        DOMICILIO: parsed.DOMICILIO || {},
        PUNTO: parsed.PUNTO || {},
      }
    }
    return { DOMICILIO: { ...parsed }, PUNTO: { ...parsed } }
  } catch {
    return empty
  }
}

/**
 * Resolve prices for all products in a pedido using pre-loaded data.
 */
export function resolverPreciosPedido(ctx: PricingContext): ItemPedidoResuelto[] {
  const { items, canal, clienteOverrides, tiersByCode, productosByCode } = ctx

  const results: ItemPedidoResuelto[] = []

  for (const item of items) {
    if (item.cantidad <= 0) continue

    let precio = 0
    let origen: ItemPedidoResuelto['origen'] = 'base'

    // 1. Manual price
    if (item.precioManual && item.precioManual > 0) {
      precio = item.precioManual
      origen = 'manual'
    }
    // 2. Client override
    else if (clienteOverrides) {
      const parsed = parsePreciosEspeciales(
        typeof clienteOverrides === 'string' ? clienteOverrides : JSON.stringify(clienteOverrides),
      )
      const channelOverride = parsed[canal]?.[item.codigo]
      if (channelOverride && channelOverride > 0) {
        precio = channelOverride
        origen = 'cliente'
      }
    }

    // 3. Volume tier
    if (precio === 0 && tiersByCode[item.codigo]) {
      const tiers = tiersByCode[item.codigo]
      let bestTier: PrecioTier | null = null
      for (const t of tiers) {
        if (t.cantMin <= item.cantidad && (t.cantMax === null || t.cantMax >= item.cantidad)) {
          if (!bestTier || t.cantMin > bestTier.cantMin) {
            bestTier = t
          }
        }
      }
      if (bestTier) {
        precio = bestTier.precio
        origen = 'volumen'
      }
    }

    // 4. Fallback to base price
    if (precio === 0) {
      const prodConfig = productosByCode[item.codigo]
      if (prodConfig?.precioBase && prodConfig.precioBase > 0) {
        precio = prodConfig.precioBase
        origen = 'base'
      }
    }

    // 5. Apply domicilio surcharge
    if (canal === 'DOMICILIO' && precio > 0) {
      const prodConfig = productosByCode[item.codigo]
      if (prodConfig?.aplicaDomicilio) {
        precio += prodConfig.sobreCostoDomicilio
      }
    }

    results.push({
      producto: item.codigo,
      precio,
      cantidad: item.cantidad,
      subtotal: precio * item.cantidad,
      origen,
    })
  }

  return results
}

/**
 * Resolve a single product price (pure function).
 */
export function resolverPrecioUnitario(
  codigo: ProductCode,
  cantidad: number,
  canal: Canal,
  clienteOverrides: Record<string, number> | null,
  precioManual: number | null | undefined,
  tiers: PrecioTier[],
  productoConfig: ProductoConfig | undefined,
): { precio: number; origen: ItemPedidoResuelto['origen'] } {
  if (precioManual && precioManual > 0) {
    return { precio: precioManual, origen: 'manual' }
  }

  if (clienteOverrides) {
    const parsed = parsePreciosEspeciales(
      typeof clienteOverrides === 'string' ? clienteOverrides : JSON.stringify(clienteOverrides),
    )
    const channelOverride = parsed[canal]?.[codigo]
    if (channelOverride && channelOverride > 0) {
      return { precio: channelOverride, origen: 'cliente' }
    }
  }

  let precio = 0
  let origen: ItemPedidoResuelto['origen'] = 'base'

  if (tiers.length > 0) {
    let bestTier: PrecioTier | null = null
    for (const t of tiers) {
      if (t.cantMin <= cantidad && (t.cantMax === null || t.cantMax >= cantidad)) {
        if (!bestTier || t.cantMin > bestTier.cantMin) {
          bestTier = t
        }
      }
    }
    if (bestTier) {
      precio = bestTier.precio
      origen = 'volumen'
    }
  }

  if (precio === 0 && productoConfig?.precioBase && productoConfig.precioBase > 0) {
    precio = productoConfig.precioBase
    origen = 'base'
  }

  if (canal === 'DOMICILIO' && precio > 0 && productoConfig?.aplicaDomicilio) {
    precio += productoConfig.sobreCostoDomicilio
  }

  return { precio, origen }
}
