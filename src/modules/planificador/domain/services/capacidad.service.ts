/**
 * Capacidad como restricción de planificación (ADR-PLANIFICADOR-001, v4 §18).
 *
 * REUTILIZA los helpers puros de `src/lib/embarque-auto.ts` (F0 §1 #5). El
 * planificador no reimplementa el peso/unidades — Embarques revalida al
 * materializar (ADR-PLANIFICADOR-003 §5).
 */

import {
  splitPedidosByCapacity,
  unidadesPedido,
  pesoPedido,
  type PedidoCantidades,
} from '@/lib/embarque-auto'
import { PESOS_KG } from '@/lib/embarque-capacidad'

export type { PedidoCantidades }

export const PRODUCTOS = ['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO'] as const
export type Producto = (typeof PRODUCTOS)[number]

/** Suma las cantidades pedidas de varios pedidos en un mapa por producto. */
export function cargaAgregada(pedidos: PedidoCantidades[]): Record<Producto, number> {
  const acc: Record<Producto, number> = {
    PACA_AGUA: 0, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0,
  }
  for (const p of pedidos) {
    acc.PACA_AGUA += p.cPacaAguaPed ?? 0
    acc.PACA_HIELO += p.cPacaHieloPed ?? 0
    acc.BOTELLON += (p.cBotellonFabPed ?? 0) + (p.cBotellonDomPed ?? 0)
    acc.BOLSA_AGUA += p.cBolsaAguaPed ?? 0
    acc.BOLSA_HIELO += p.cBolsaHieloPed ?? 0
  }
  return acc
}

export function unidadesTotales(pedidos: PedidoCantidades[]): number {
  return pedidos.reduce((s, p) => s + unidadesPedido(p), 0)
}

export function pesoTotalKg(pedidos: PedidoCantidades[]): number {
  return Math.round(pedidos.reduce((s, p) => s + pesoPedido(p), 0) * 100) / 100
}

/**
 * Divide un conjunto de pedidos (ya agrupados por zona/afinidad) en sub-grupos
 * que respetan `maxUnidades`. Preserva el orden de entrada.
 */
export function dividirPorCapacidad<T extends PedidoCantidades>(
  pedidos: T[],
  maxUnidades: number,
): T[][] {
  return splitPedidosByCapacity(pedidos, maxUnidades)
}

export { PESOS_KG }
