/**
 * PrecioEmbarque Domain Service.
 *
 * Handles price resolution for ventas libres during embarque closing.
 * Delegates to the pricing engine (infrastructure concern).
 */

export interface PrecioResuelto {
  codigo: string
  precio: number
  fuente: 'tabla' | 'resuelto' | 'manual'
}

export interface ItemPrecio {
  codigo: string
  cantidad: number
}

/**
 * Port for price resolution.
 * Implemented by infrastructure layer (pricing engine adapter).
 */
export interface IPrecioResolver {
  resolver(items: ItemPrecio[], canal: string, clienteId?: string): Promise<Map<string, PrecioResuelto>>
}

export class PrecioEmbarqueService {
  private readonly precioResolver: IPrecioResolver

  constructor(precioResolver: IPrecioResolver) {
    this.precioResolver = precioResolver
  }

  /**
   * Resolves prices for venta libre items using the pricing engine.
   * Falls back to average prices from existing embarque pedidos if resolver fails.
   */
  async resolverPreciosVentaLibre(
    items: ItemPrecio[],
    canal: string,
    preciosPromedio?: Map<string, number>,
  ): Promise<Map<string, number>> {
    try {
      const resueltos = await this.precioResolver.resolver(items, canal)
      const precios = new Map<string, number>()
      for (const [codigo, resuelto] of resueltos) {
        precios.set(codigo, resuelto.precio)
      }
      return precios
    } catch {
      // Fallback to average prices from existing pedidos
      if (preciosPromedio) {
        return preciosPromedio
      }
      // If no fallback available, return empty map (caller should handle)
      return new Map()
    }
  }
}
