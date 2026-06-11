/**
 * Sprint 3 (C-2 Fase 1): Helper para sincronizar las columnas legacy
 * de Pedido desde el shape canónico `items[]`.
 *
 * Hasta ahora, varios routes (ej: venta-libre) escribían las 18 columnas
 * legacy hardcoded en línea (cPacaAguaPed, cBotellonDomPed, etc.) con
 * lógica duplicada e inconsistente. Esto causaba:
 *   - Drift entre items[] y legacy cuando alguien olvidaba un campo
 *   - Split incorrecto del botellón según canal (venta-libre siempre
 *     ponía 0 en Fab y la cantidad en Dom, ignorando si era PUNTO)
 *   - ~18 líneas de código duplicadas por cada call-site
 *
 * Esta función es la ÚNICA fuente de verdad para la sincronización
 * legacy desde items[]. El dominio Pedido.toLegacyFields() del módulo
 * DDD usa la misma lógica (ver src/modules/pedidos/domain/entities/Pedido.ts:257-295).
 *
 * Patrón: dado un array de items con `{ producto, cantidad, precio }` y
 * el canal, retorna el objeto legacy listo para spread en prisma.pedido.create().
 *
 * Uso:
 *   const data = {
 *     ...,
 *     items: { create: items.map(i => ({ ... })) },
 *     ...buildPedidoLegacyFields(items, 'DOMICILIO'),
 *   }
 *   await prisma.pedido.create({ data })
 */

import type { ProductCode } from '@/shared/domain'

export interface LegacyItemInput {
  producto: ProductCode | string
  cantidad: number
  /** En venta-libre, cantEntrega === cantPedido al momento de creación. */
  cantEntrega?: number
  /** Precio unitario en pesos (Number o Decimal serializado). */
  precio?: number
}

export type Canal = 'PUNTO' | 'DOMICILIO'

/**
 * Construye el objeto de campos legacy de Pedido a partir de items[].
 * Mantiene el shape exacto que Prisma espera: 18 campos (cPacaAguaPed/Ent,
 * cBotellonFab/DomPed/Ent, etc.).
 */
export function buildPedidoLegacyFields(
  items: LegacyItemInput[],
  canal: Canal,
): Record<string, number> {
  const result: Record<string, number> = {}

  const getCant = (code: ProductCode, field: 'cantidad' | 'cantEntrega' = 'cantidad') => {
    const item = items.find(i => i.producto === code)
    if (!item) return 0
    return field === 'cantEntrega' ? (item.cantEntrega ?? item.cantidad) : item.cantidad
  }

  const getPrecio = (code: ProductCode) => {
    const item = items.find(i => i.producto === code)
    return item?.precio ?? 0
  }

  // PACA_AGUA
  result.cPacaAguaPed = getCant('PACA_AGUA')
  result.cPacaAguaEnt = getCant('PACA_AGUA', 'cantEntrega')
  result.precioPacaAgua = getPrecio('PACA_AGUA')

  // PACA_HIELO
  result.cPacaHieloPed = getCant('PACA_HIELO')
  result.cPacaHieloEnt = getCant('PACA_HIELO', 'cantEntrega')
  result.precioPacaHielo = getPrecio('PACA_HIELO')

  // BOLSA_AGUA
  result.cBolsaAguaPed = getCant('BOLSA_AGUA')
  result.cBolsaAguaEnt = getCant('BOLSA_AGUA', 'cantEntrega')
  result.precioBolsaAgua = getPrecio('BOLSA_AGUA')

  // BOLSA_HIELO
  result.cBolsaHieloPed = getCant('BOLSA_HIELO')
  result.cBolsaHieloEnt = getCant('BOLSA_HIELO', 'cantEntrega')
  result.precioBolsaHielo = getPrecio('BOLSA_HIELO')

  // BOTELLON: split por canal. PUNTO → Fab, DOMICILIO → Dom.
  // FIX: antes, venta-libre ponía siempre cBotellonFabPed=0 y la cantidad
  // en Dom, ignorando el canal. Si el canal es PUNTO y hay botellones,
  // esto causaba drift silencioso.
  const botellonCantPed = getCant('BOTELLON')
  const botellonCantEnt = getCant('BOTELLON', 'cantEntrega')
  const botellonPrecio = getPrecio('BOTELLON')

  if (canal === 'PUNTO') {
    result.cBotellonFabPed = botellonCantPed
    result.cBotellonFabEnt = botellonCantEnt
    result.cBotellonDomPed = 0
    result.cBotellonDomEnt = 0
    result.precioBotellonFab = botellonPrecio
    result.precioBotellonDom = 0
  } else {
    result.cBotellonFabPed = 0
    result.cBotellonFabEnt = 0
    result.cBotellonDomPed = botellonCantPed
    result.cBotellonDomEnt = botellonCantEnt
    result.precioBotellonFab = 0
    result.precioBotellonDom = botellonPrecio
  }

  return result
}
