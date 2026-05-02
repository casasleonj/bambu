import { prisma } from '@/lib/prisma'
import type { PrismaClient } from '@prisma/client'

// Product codes matching the Producto.codigo values in the database
export const PRODUCT_CODES = [
  'PACA_AGUA',
  'PACA_HIELO',
  'BOTELLON_FAB',
  'BOTELLON_DOM',
  'BOLSA_AGUA',
  'BOLSA_HIELO',
] as const

export type ProductCode = typeof PRODUCT_CODES[number]
export type Canal = 'PUNTO' | 'DOMICILIO'

export interface PrecioResuelto {
  codigo: ProductCode
  precio: number
  cantidad: number
  subtotal: number
  origen: 'manual' | 'cliente' | 'volumen' | 'base'
}

/**
 * Parse preciosEspeciales JSON into a per-channel map.
 * Supports new format: {"DOMICILIO":{"PACA_AGUA":6000},"PUNTO":{...}}
 * And legacy format: {"PACA_AGUA":6000} → applied to both channels.
 */
export function parsePreciosEspeciales(
  json: string | null | undefined,
): Record<Canal, Record<string, number>> {
  const empty: Record<Canal, Record<string, number>> = { DOMICILIO: {}, PUNTO: {} }
  if (!json) return empty

  try {
    const parsed = JSON.parse(json)
    // New format: has DOMICILIO or PUNTO keys
    if (parsed.DOMICILIO || parsed.PUNTO) {
      return {
        DOMICILIO: parsed.DOMICILIO || {},
        PUNTO: parsed.PUNTO || {},
      }
    }
    // Legacy format: flat {PACA_AGUA: 6000} → apply to both
    return { DOMICILIO: { ...parsed }, PUNTO: { ...parsed } }
  } catch {
    return empty
  }
}

/**
 * Resolve the price for a single product.
 * Priority: precioManual > clienteOverrides (by canal) > PrecioVolumen tier > 0
 */
export async function resolverPrecio(
  codigo: ProductCode,
  cantidad: number,
  canal: Canal,
  clienteOverrides?: Record<string, number> | null,
  precioManual?: number | null,
  db?: PrismaClient,
): Promise<{ precio: number; origen: PrecioResuelto['origen'] }> {
  if (precioManual && precioManual > 0) {
    return { precio: precioManual, origen: 'manual' }
  }

  // Try channel-specific override first
  if (clienteOverrides) {
    const parsed = parsePreciosEspeciales(
      typeof clienteOverrides === 'string' ? clienteOverrides : JSON.stringify(clienteOverrides),
    )
    const channelOverride = parsed[canal]?.[codigo]
    if (channelOverride && channelOverride > 0) {
      return { precio: channelOverride, origen: 'cliente' }
    }
  }

  const client = db || prisma

  // Look up volume pricing from DB
  const tier = await client.precioVolumen.findFirst({
    where: {
      producto: { codigo },
      canal,
      cantMin: { lte: cantidad },
      activo: true,
      OR: [
        { cantMax: { gte: cantidad } },
        { cantMax: null },
      ],
    },
    orderBy: { cantMin: 'desc' },
  })

  if (tier) {
    return { precio: Number(tier.precio), origen: 'volumen' }
  }

  return { precio: 0, origen: 'base' }
}

/**
 * Resolve prices for all products in a pedido.
 * Uses a SINGLE batch query for all volume tiers instead of N sequential queries.
 * Returns a map of product code -> resolved price info.
 */
export async function resolverPreciosPedido(
  items: Array<{ codigo: ProductCode; cantidad: number; precioManual?: number }>,
  canal: Canal,
  clienteId?: string,
  db?: PrismaClient,
): Promise<PrecioResuelto[]> {
  // Get client overrides if clienteId provided
  let clienteOverrides: Record<string, number> | null = null
  if (clienteId) {
    const client = db || prisma
    const cliente = await client.cliente.findUnique({
      where: { id: clienteId },
      select: { preciosEspeciales: true },
    })
    if (cliente?.preciosEspeciales) {
      try {
        clienteOverrides = JSON.parse(cliente.preciosEspeciales)
      } catch { /* invalid JSON, ignore */ }
    }
  }

  // Batch load all relevant volume tiers in ONE query
  const activeCodes = items.filter(i => i.cantidad > 0).map(i => i.codigo)
  const maxCantidades: Record<string, number> = {}
  for (const item of items) {
    if (item.cantidad > 0) {
      maxCantidades[item.codigo] = Math.max(maxCantidades[item.codigo] || 0, item.cantidad)
    }
  }

  let tiersByCode: Record<string, Array<{ cantMin: number; cantMax: number | null; precio: number }>> = {}
  if (activeCodes.length > 0) {
    const client = db || prisma
    const allTiers = await client.precioVolumen.findMany({
      where: {
        producto: { codigo: { in: activeCodes } },
        canal,
        activo: true,
      },
      include: { producto: true },
      orderBy: [{ producto: { codigo: 'asc' } }, { cantMin: 'asc' }],
    })

    for (const tier of allTiers) {
      const code = tier.producto.codigo
      if (!tiersByCode[code]) tiersByCode[code] = []
      tiersByCode[code].push({
        cantMin: tier.cantMin,
        cantMax: tier.cantMax,
        precio: Number(tier.precio),
      })
    }
  }

  // Resolve each item using pre-loaded tiers (no more DB calls)
  const results: PrecioResuelto[] = []
  for (const item of items) {
    if (item.cantidad <= 0) continue

    let precio = 0
    let origen: PrecioResuelto['origen'] = 'base'

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

    // 3. Volume tier (only if not already resolved)
    if (precio === 0 && tiersByCode[item.codigo]) {
      const tiers = tiersByCode[item.codigo]
      // Find best matching tier (highest cantMin <= cantidad)
      let bestTier: { cantMin: number; cantMax: number | null; precio: number } | null = null
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

    results.push({
      codigo: item.codigo,
      precio,
      cantidad: item.cantidad,
      subtotal: precio * item.cantidad,
      origen,
    })
  }

  return results
}

/**
 * Get the default price table for display (e.g., in PedidoForm).
 * Returns all active prices grouped by product and channel.
 */
export async function getPriceTable(canal: Canal): Promise<Record<ProductCode, Array<{ cantMin: number; cantMax: number | null; precio: number }>>> {
  const precios = await prisma.precioVolumen.findMany({
    where: { canal, activo: true },
    include: { producto: true },
    orderBy: [{ producto: { codigo: 'asc' } }, { cantMin: 'asc' }],
  })

  const table: Record<string, Array<{ cantMin: number; cantMax: number | null; precio: number }>> = {}
  for (const p of precios) {
    const code = p.producto.codigo
    if (!table[code]) table[code] = []
    table[code].push({
      cantMin: p.cantMin,
      cantMax: p.cantMax,
      precio: Number(p.precio),
    })
  }

  return table as any
}
