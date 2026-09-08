import type { ProductoCodigo, ValueOrigin } from './types'

const CODIGOS_VALIDOS: readonly string[] = ['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO']

/** claves legacy de `productosSugeridos` del GET /api/clientes/[id]. */
const LEGACY: Record<string, ProductoCodigo> = {
  cPacaAguaPed: 'PACA_AGUA',
  cPacaHieloPed: 'PACA_HIELO',
  cBotellonFabPed: 'BOTELLON',
  cBotellonDomPed: 'BOTELLON',
  cBolsaAguaPed: 'BOLSA_AGUA',
  cBolsaHieloPed: 'BOLSA_HIELO',
}

function normCodigo(c: string): ProductoCodigo | null {
  if (CODIGOS_VALIDOS.includes(c)) return c as ProductoCodigo
  return LEGACY[c] ?? null
}

export interface Propuesta {
  id: 'ultima' | 'patron'
  titulo: string
  lineas: Array<{ producto: ProductoCodigo; cantidad: number }>
  canal?: 'PUNTO' | 'DOMICILIO'
  /** procedencia de los valores que aplica (ALS §8). */
  origin: ValueOrigin
}

export interface ClienteDetalleParaPropuesta {
  pedidos?: Array<{
    estadoEntrega?: string
    canal?: string
    items?: Array<{ producto: string; cantPedido: number }>
  }>
  productosSugeridos?: Array<{ codigo: string; nombre: string; cantidadPromedio: number }>
}

function mergeLineas(raw: Array<{ c: string; q: number }>): Array<{ producto: ProductoCodigo; cantidad: number }> {
  const acc = new Map<ProductoCodigo, number>()
  for (const { c, q } of raw) {
    const cod = normCodigo(c)
    if (!cod || !(q > 0)) continue
    acc.set(cod, (acc.get(cod) ?? 0) + q)
  }
  return [...acc.entries()].map(([producto, cantidad]) => ({ producto, cantidad }))
}

/**
 * Deriva propuestas para el flujo "Repetir" (blueprint intención 3 / §3):
 * la plantilla desaparece como concepto de UI — se ofrece "repetir el
 * pedido anterior" o "usar el patrón de consumo" a partir del detalle del
 * cliente ya cargado. Aplicar una propuesta es SIEMPRE una acción explícita
 * del usuario, con `ValueOrigin` para trazar de dónde salió cada valor.
 */
export function buildPropuestas(detalle: ClienteDetalleParaPropuesta): Propuesta[] {
  const out: Propuesta[] = []

  const ultima = detalle.pedidos?.find(
    (p) => p.estadoEntrega && !['ANULADO', 'CANCELADO'].includes(p.estadoEntrega),
  )
  if (ultima?.items?.length) {
    const lineas = mergeLineas(ultima.items.map((it) => ({ c: it.producto, q: it.cantPedido })))
    if (lineas.length) {
      out.push({
        id: 'ultima',
        titulo: 'Repetir el pedido anterior',
        lineas,
        canal: ultima.canal === 'PUNTO' || ultima.canal === 'DOMICILIO' ? ultima.canal : undefined,
        origin: 'HISTORY',
      })
    }
  }

  if (detalle.productosSugeridos?.length) {
    const lineas = mergeLineas(detalle.productosSugeridos.map((p) => ({ c: p.codigo, q: p.cantidadPromedio })))
    if (lineas.length) {
      out.push({ id: 'patron', titulo: 'Usar el patrón de consumo habitual', lineas, origin: 'HISTORY' })
    }
  }

  return out
}
