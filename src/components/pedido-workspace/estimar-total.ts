import type { Tier } from '@/components/pedido-form-unified/types'
import type { DraftItem } from './types'

interface ProductoConfig {
  codigo: string
  aplicaDomicilio: boolean
  sobreCostoDomicilio: number
}

/**
 * Total ESTIMADO para trabajar sin conexión (B-20, #347). NO es autoritativo:
 * sin red no hay preview del servidor, así que se usa la tabla de precios que
 * el workspace ya cargó al abrirse (tramos por cantidad + recargo de domicilio).
 * No conoce precios especiales de cliente/negocio. Al sincronizar, el servidor
 * recalcula todo; si cambia el total, el saldo o el excedente se ajustan ahí.
 *
 * Devuelve `null` si la tabla no se alcanzó a cargar (no se inventan precios
 * con valores por defecto que pueden estar desactualizados).
 */
export function estimarTotalOffline(
  items: DraftItem[],
  canal: 'PUNTO' | 'DOMICILIO',
  tabla: Record<string, Tier[]>,
  configs: ProductoConfig[],
): number | null {
  const conCantidad = items.filter((i) => i.cantidad > 0)
  if (conCantidad.length === 0) return null
  let total = 0
  for (const item of conCantidad) {
    let unitario: number
    if (item.precioManual && item.precioManual > 0) {
      unitario = item.precioManual
    } else {
      const tiers = tabla[item.producto]
      if (!tiers || tiers.length === 0) return null
      const tramo = tiers.find((t) => item.cantidad >= t.cantMin && (t.cantMax == null || item.cantidad <= t.cantMax)) ?? tiers[0]
      unitario = tramo.precio
      if (canal === 'DOMICILIO') {
        const cfg = configs.find((c) => c.codigo === item.producto)
        if (cfg?.aplicaDomicilio) unitario += Number(cfg.sobreCostoDomicilio)
      }
    }
    total += unitario * item.cantidad
  }
  return total
}
