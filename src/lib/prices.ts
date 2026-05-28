/**
 * @deprecated Use producto.precioBase from the database instead.
 * This is kept as a client-side safety net only. Server-side pricing
 * now falls back to precioBase when no volume tiers exist.
 */
export const DEFAULT_PRICES: Record<string, number> = {
  PACA_AGUA: 6500,
  PACA_HIELO: 8000,
  BOTELLON: 7500,
  BOLSA_AGUA: 2500,
  BOLSA_HIELO: 3000,
}

export const PRODUCTO_INFO: Record<string, {
  nombre: string
  unidad: string
  codigo: string
}> = {
  pacaAgua:    { nombre: 'Paca de Agua (40u 300ml)', unidad: 'pacas', codigo: 'PACA_AGUA' },
  pacaHielo:   { nombre: 'Paca de Hielo (20u 600ml)', unidad: 'pacas', codigo: 'PACA_HIELO' },
  botellon:    { nombre: 'Botellón 20LT', unidad: 'und', codigo: 'BOTELLON' },
  bolsaAgua:   { nombre: 'Bolsa de Agua 300ml', unidad: 'bolsas', codigo: 'BOLSA_AGUA' },
  bolsaHielo:  { nombre: 'Bolsa de Hielo 600ml', unidad: 'bolsas', codigo: 'BOLSA_HIELO' },
}

export type ProductoId = keyof typeof PRODUCTO_INFO

/**
 * Returns product IDs available for a given channel.
 * For PUNTO: all active products.
 * For DOMICILIO: only products with aplicaDomicilio=true.
 * NOTE: This requires fetching product config from DB. Use as fallback only.
 * Prefer passing the filtered product list from the API/DB.
 */
export function getProductosForCanal(canal: 'PUNTO' | 'DOMICILIO', productos: Array<{ codigo: string; aplicaDomicilio: boolean }> = []): ProductoId[] {
  const allIds = Object.keys(PRODUCTO_INFO) as ProductoId[]
  if (canal === 'PUNTO') return allIds
  if (productos.length === 0) {
    // Fallback: all products apply for domicilio in current config
    return allIds
  }
  const domicilioCodes = new Set(productos.filter(p => p.aplicaDomicilio).map(p => p.codigo))
  return allIds.filter(id => domicilioCodes.has(PRODUCTO_INFO[id].codigo))
}
