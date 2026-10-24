/**
 * Corrección de precio en el cierre del embarque (#326; decisión del PO 2026-10-23;
 * ADR-MONETARIO-001, addendum «Corrección de precio en el cierre»).
 *
 * Función pura: decide QUÉ se corrige y cuánto cambia la obligación; no toca la base.
 * Aplica igual a COMPLETO y PARCIAL:
 *
 *  - Solo ADMIN corrige (los demás roles: se ignora, como hasta ahora).
 *  - Un precio vacío, 0 o inválido NO es una corrección: se conserva el precio del pedido.
 *    (La pantalla manda `0` por un campo vacío; tomarlo como precio dejaba el pedido en $0.)
 *  - Una corrección real exige motivo (`PRECIO_SIN_MOTIVO`).
 *  - El precio rige para todo el pedido (cada línea tiene un único precio):
 *      total nuevo = total + Σ (precio nuevo − precio anterior) × cantidad PEDIDA.
 *    Se suma el delta (no se recalcula Σ líneas) para respetar ajustes ya aplicados al total.
 *  - Si el cliente ya pagó más que el nuevo total, se rechaza (`PRECIO_GENERARIA_SOBREPAGO`):
 *    corregir hacia abajo por debajo de lo pagado exige una reversión monetaria previa
 *    (ADR-CORRECCION-MONETARIA-001), igual que `CORRECCION_GENERARIA_SOBREPAGO` de G11.
 */
export type ClavePrecio = 'pacaAgua' | 'pacaHielo' | 'botellonFab' | 'botellonDom' | 'bolsaAgua' | 'bolsaHielo'
export type PreciosPorClave = Record<ClavePrecio, number>

export interface PedidoParaCorreccion {
  numero: number
  total: number
  totalPagado: number
  precios: PreciosPorClave
  /** Cantidad PEDIDA (no entregada) por clave de precio. */
  cantidades: PreciosPorClave
}

export interface CambioPrecio {
  clave: ClavePrecio
  antes: number
  despues: number
  cantidad: number
}

export interface CorreccionPrecio {
  hayCorreccion: boolean
  /** Precios a persistir: los del pedido salvo donde hay una corrección válida. */
  precios: PreciosPorClave
  cambios: CambioPrecio[]
  totalAntes: number
  totalDespues: number
  motivo?: string
}

export const ETIQUETA_PRECIO: Record<ClavePrecio, string> = {
  pacaAgua: 'PACA_AGUA',
  pacaHielo: 'PACA_HIELO',
  botellonFab: 'BOTELLON_FAB',
  botellonDom: 'BOTELLON_DOM',
  bolsaAgua: 'BOLSA_AGUA',
  bolsaHielo: 'BOLSA_HIELO',
}

const CLAVES = Object.keys(ETIQUETA_PRECIO) as ClavePrecio[]
const MOTIVO_MIN = 5
const centavos = (n: number) => Math.round(n * 100)

export function resolverCorreccionPrecio(input: {
  pedido: PedidoParaCorreccion
  preciosReales?: Record<string, number> | null
  motivo?: string | null
  esAdmin: boolean
}): CorreccionPrecio {
  const { pedido } = input
  const precios: PreciosPorClave = { ...pedido.precios }
  const cambios: CambioPrecio[] = []

  if (input.esAdmin && input.preciosReales) {
    for (const clave of CLAVES) {
      const propuesto = input.preciosReales[clave]
      if (typeof propuesto !== 'number' || !Number.isFinite(propuesto) || propuesto <= 0) continue
      const antes = pedido.precios[clave]
      const cantidad = pedido.cantidades[clave]
      // Sin unidades pedidas en esa línea no hay nada que corregir.
      if (cantidad <= 0 || centavos(propuesto) === centavos(antes)) continue
      precios[clave] = propuesto
      cambios.push({ clave, antes, despues: propuesto, cantidad })
    }
  }

  const totalAntes = pedido.total
  if (cambios.length === 0) {
    return { hayCorreccion: false, precios, cambios, totalAntes, totalDespues: totalAntes }
  }

  const motivo = (input.motivo ?? '').trim()
  if (motivo.length < MOTIVO_MIN) {
    throw new Error(`PRECIO_SIN_MOTIVO: corregir un precio en el cierre exige un motivo (pedido #${pedido.numero})`)
  }

  const deltaCentavos = cambios.reduce((s, c) => s + (centavos(c.despues) - centavos(c.antes)) * c.cantidad, 0)
  const totalDespuesC = centavos(totalAntes) + deltaCentavos
  const totalDespues = totalDespuesC / 100

  if (totalDespuesC <= 0) {
    throw new Error(`PRECIO_INVALIDO: el nuevo total del pedido #${pedido.numero} sería $${totalDespues}`)
  }
  if (totalDespuesC < centavos(pedido.totalPagado)) {
    throw new Error(
      `PRECIO_GENERARIA_SOBREPAGO: el cliente ya pagó $${pedido.totalPagado} y el nuevo total del pedido #${pedido.numero} ` +
      `sería $${totalDespues}; la diferencia requiere una reversión monetaria previa`,
    )
  }

  return { hayCorreccion: true, precios, cambios, totalAntes, totalDespues, motivo }
}
