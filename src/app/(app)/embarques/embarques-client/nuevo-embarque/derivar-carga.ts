import { unidadesPedido, pesoPedido, type PedidoCantidades } from '@/lib/embarque-auto'

/**
 * Deriva la carga del motocarga a partir de los pedidos elegidos.
 *
 * El humano elige pedidos; el sistema calcula qué hay que cargar. La carga es
 * editable después (el asistente puede sumar producto para regalos, cambios,
 * etc.), pero arranca pre-llenada con lo que piden los pedidos.
 *
 * `BOTELLON` de la carga = fábrica + domicilio (el embarque no distingue el
 * origen del botellón; el pedido sí).
 */

export const PRODUCTOS_CARGA = ['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO'] as const
export type ProductoCarga = (typeof PRODUCTOS_CARGA)[number]
export type Carga = Record<ProductoCarga, number>

export function cargaVacia(): Carga {
  return { PACA_AGUA: 0, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 }
}

/** Σ productos de los pedidos → carga por producto. */
export function derivarCarga(pedidos: PedidoCantidades[]): Carga {
  const carga = cargaVacia()
  for (const p of pedidos) {
    carga.PACA_AGUA += p.cPacaAguaPed || 0
    carga.PACA_HIELO += p.cPacaHieloPed || 0
    carga.BOTELLON += (p.cBotellonFabPed || 0) + (p.cBotellonDomPed || 0)
    carga.BOLSA_AGUA += p.cBolsaAguaPed || 0
    carga.BOLSA_HIELO += p.cBolsaHieloPed || 0
  }
  return carga
}

/** Total de unidades de una carga (para el CTA "N unidades"). */
export function totalUnidadesCarga(carga: Carga): number {
  return PRODUCTOS_CARGA.reduce((s, k) => s + (carga[k] || 0), 0)
}

/** Unidades y peso de la selección de pedidos (resumen del Paso 1). */
export function resumenSeleccion(pedidos: PedidoCantidades[]): { unidades: number; pesoKg: number } {
  return {
    unidades: pedidos.reduce((s, p) => s + unidadesPedido(p), 0),
    pesoKg: pedidos.reduce((s, p) => s + pesoPedido(p), 0),
  }
}
