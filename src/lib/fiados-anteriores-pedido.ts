/**
 * #932: aviso sobre COBROS PENDIENTES DE OTROS PEDIDOS del mismo titular.
 * No compara fechas: la antigüedad de creación/entrega no demuestra qué
 * importes debe cobrar el personal actualmente.
 *
 * Los importes provienen de leerExigibles() en un único snapshot.
 * Las unidades describen entregas asociadas, no unidades individualmente impagas.
 */
import { isConsumidorFinalCanonical } from './cliente-canonical'

export interface PedidoVisibleFiados {
  id: string
  clienteId: string
}

export interface DeudaParaAviso {
  id: string
  numero: number
  clienteId: string
  exigible: number
  negocioNombre: string | null
  productos: ReadonlyArray<{ producto: string; cantidadEntregada: number }>
  pagoPorConfirmar?: boolean
}

export interface ResumenFiadosAnteriores {
  /** Exigible de otros pedidos, excluyendo el pedido visible, en pesos. */
  total: number
  /** Exigible del pedido visible en el mismo snapshot, en pesos. */
  propio: number
  /** Suma de exigibles del titular, incluido el visible, en pesos. */
  totalCliente: number
  /** Número de OTROS pedidos con deuda exigible. */
  pedidos: number
  /** Entregas físicas asociadas a otros pedidos con deuda. */
  productos: Array<{ producto: string; cantidad: number }>
  negocios: string[]
  /** Identifica cada origen sin atribuir el importe a otro negocio. */
  origenes: Array<{ numero: number; negocio: string | null; importe: number }>
  pagoPorConfirmar: boolean
}

const aCentavos = (importe: number): number => {
  const centavos = Math.round(importe * 100)
  return Number.isSafeInteger(centavos) && centavos > 0 ? centavos : 0
}

/**
 * Una sola identidad canónica de cliente; cada pedido con deuda cuenta una vez.
 * Nunca confunde un pedido propio con los OTROS pedidos del mismo titular.
 */
export function resumirFiadosAnteriores(
  visibles: readonly PedidoVisibleFiados[],
  deudas: readonly DeudaParaAviso[],
): Map<string, ResumenFiadosAnteriores> {
  const porCliente = new Map<string, DeudaParaAviso[]>()
  const pedidosVistos = new Set<string>()
  for (const deuda of deudas) {
    if (isConsumidorFinalCanonical(deuda.clienteId) ||
        pedidosVistos.has(deuda.id) || aCentavos(deuda.exigible) === 0) continue
    pedidosVistos.add(deuda.id)
    const grupo = porCliente.get(deuda.clienteId) ?? []
    grupo.push(deuda)
    porCliente.set(deuda.clienteId, grupo)
  }

  const resultado = new Map<string, ResumenFiadosAnteriores>()
  for (const visible of visibles) {
    if (isConsumidorFinalCanonical(visible.clienteId)) continue
    const delCliente = porCliente.get(visible.clienteId) ?? []
    const propio = aCentavos(delCliente.find(d => d.id === visible.id)?.exigible ?? 0)
    const totalCliente = delCliente.reduce((s, d) => s + aCentavos(d.exigible), 0)
    const otros = totalCliente - propio
    if (otros <= 0) continue

    const ajenos = delCliente.filter(d => d.id !== visible.id)
    const productos = new Map<string, number>()
    const negocios = new Set<string>()
    for (const deuda of ajenos) {
      if (deuda.negocioNombre?.trim()) negocios.add(deuda.negocioNombre.trim())
      for (const linea of deuda.productos) {
        if (!linea.producto || !Number.isSafeInteger(linea.cantidadEntregada) ||
            linea.cantidadEntregada <= 0) continue
        productos.set(linea.producto, (productos.get(linea.producto) ?? 0) + linea.cantidadEntregada)
      }
    }
    resultado.set(visible.id, {
      total: otros / 100,
      propio: propio / 100,
      totalCliente: totalCliente / 100,
      pedidos: ajenos.length,
      productos: [...productos].map(([producto, cantidad]) => ({ producto, cantidad }))
        .sort((a, b) => a.producto.localeCompare(b.producto)),
      negocios: [...negocios].sort((a, b) => a.localeCompare(b)),
      origenes: ajenos.map(d => ({ numero: d.numero, negocio: d.negocioNombre,
        importe: aCentavos(d.exigible) / 100 }))
        .sort((a, b) => a.numero - b.numero),
      pagoPorConfirmar: ajenos.some(d => d.pagoPorConfirmar),
    })
  }
  return resultado
}
