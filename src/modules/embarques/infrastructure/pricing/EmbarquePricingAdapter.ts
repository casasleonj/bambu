/**
 * EmbarquePricingAdapter.
 *
 * Infrastructure adapter that implements IPrecioResolver port.
 * Delegates to the existing pricing engine in lib/pricing.ts.
 */

import { resolverPrecio } from '@/lib/pricing'
import type { ProductCode } from '../../domain/value-objects/Carga'
import type { IPrecioResolver, ItemPrecio, PrecioResuelto } from '../../domain/services/precio-embarque.service'

export class EmbarquePricingAdapter implements IPrecioResolver {
  async resolver(
    items: ItemPrecio[],
    canal: string,
    _clienteId?: string,
  ): Promise<Map<string, PrecioResuelto>> {
    const resultados = new Map<string, PrecioResuelto>()

    for (const item of items) {
      try {
        const resultado = await resolverPrecio(
          item.codigo as ProductCode,
          item.cantidad,
          canal as 'PUNTO' | 'DOMICILIO',
        )

        resultados.set(item.codigo, {
          codigo: item.codigo,
          precio: resultado.precio,
          fuente: 'resuelto',
        })
      } catch {
        // If pricing engine fails, caller will handle fallback
        continue
      }
    }

    return resultados
  }
}
