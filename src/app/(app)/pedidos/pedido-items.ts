import { getProductoIconConfig } from '@/lib/producto-iconos'
import type { Pedido } from './pedidos-client/types'

/**
 * Items de un pedido, con fallback a las columnas legacy per-producto.
 * Compartido por `pedido-table.tsx` (V1) y el Pedido Hub (V2).
 */
export function getItemsFromPedido(pedido: Pedido): Array<{ producto: string; cantPedido: number }> {
  if (pedido.items && pedido.items.length > 0) {
    return pedido.items.filter((i) => i.cantPedido > 0).map((i) => ({ producto: i.producto, cantPedido: i.cantPedido }))
  }
  const legacy: Array<{ producto: string; cantPedido: number }> = []
  if (pedido.cPacaAguaPed > 0) legacy.push({ producto: 'PACA_AGUA', cantPedido: pedido.cPacaAguaPed })
  if (pedido.cPacaHieloPed > 0) legacy.push({ producto: 'PACA_HIELO', cantPedido: pedido.cPacaHieloPed })
  const botellonTotal = (pedido.cBotellonFabPed || 0) + (pedido.cBotellonDomPed || 0)
  if (botellonTotal > 0) legacy.push({ producto: 'BOTELLON', cantPedido: botellonTotal })
  if (pedido.cBolsaAguaPed > 0) legacy.push({ producto: 'BOLSA_AGUA', cantPedido: pedido.cBolsaAguaPed })
  if (pedido.cBolsaHieloPed > 0) legacy.push({ producto: 'BOLSA_HIELO', cantPedido: pedido.cBolsaHieloPed })
  return legacy
}

/** "20 Paca de agua, 5 Paca de hielo" — resumen corto para la lista. */
export function pedidoItemsResumen(pedido: Pedido): string {
  const items = getItemsFromPedido(pedido)
  if (items.length === 0) return 'Sin productos'
  return items.map((i) => `${i.cantPedido} ${getProductoIconConfig(i.producto).label ?? i.producto}`).join(', ')
}
