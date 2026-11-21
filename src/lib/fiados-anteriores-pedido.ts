/**
 * #932: aviso contextual de fiados de pedidos anteriores al pedido visible.
 *
 * No es una contabilidad paralela: recibe el importe exigible de leerExigibles().
 * Las cantidades describen productos ENTREGADOS en pedidos con deuda, no
 * unidades individuales "sin pagar" (un abono no se distribuye por producto).
 */
import { isConsumidorFinalCanonical } from './cliente-canonical'

export interface PedidoVisibleFiados {
  id: string
  clienteId: string
  createdAt: Date
}

export interface DeudaParaAviso {
  id: string
  clienteId: string
  createdAt: Date
  exigible: number
  negocioNombre: string | null
  productos: ReadonlyArray<{ producto: string; cantidadEntregada: number }>
}

export interface ResumenFiadosAnteriores {
  /** Deuda exigible de OTROS pedidos anteriores, en pesos. */
  total: number
  /** Número de pedidos anteriores con deuda exigible. */
  pedidos: number
  /** Productos entregados asociados a esos pedidos; no implica que cada unidad esté impaga. */
  productos: Array<{ producto: string; cantidad: number }>
  /** Negocios de origen de la deuda (pueden diferir del negocio del pedido actual). */
  negocios: string[]
}

const antesDe = (a: Pick<DeudaParaAviso, 'id' | 'createdAt'>, b: PedidoVisibleFiados): boolean =>
  a.createdAt.getTime() < b.createdAt.getTime() ||
  (a.createdAt.getTime() === b.createdAt.getTime() && a.id.localeCompare(b.id) < 0)

/**
 * Indexa primero por identificador CANÓNICO de cliente, no por nombre,
 * teléfono, negocio ni el histórico anónimo CONSUMIDOR_FINAL.
 */
export function resumirFiadosAnteriores(
  visibles: readonly PedidoVisibleFiados[],
  deudas: readonly DeudaParaAviso[],
): Map<string, ResumenFiadosAnteriores> {
  const porCliente = new Map<string, DeudaParaAviso[]>()
  for (const deuda of deudas) {
    if (isConsumidorFinalCanonical(deuda.clienteId)) continue
    if (!Number.isFinite(deuda.exigible) || Math.round(deuda.exigible * 100) <= 0) continue
    const anteriores = porCliente.get(deuda.clienteId) ?? []
    anteriores.push(deuda)
    porCliente.set(deuda.clienteId, anteriores)
  }

  const resultado = new Map<string, ResumenFiadosAnteriores>()
  for (const visible of visibles) {
    if (isConsumidorFinalCanonical(visible.clienteId)) continue
    const anteriores = (porCliente.get(visible.clienteId) ?? [])
      .filter(d => d.id !== visible.id && antesDe(d, visible))
    if (!anteriores.length) continue

    const productos = new Map<string, number>()
    const negocios = new Set<string>()
    let centavos = 0
    for (const deuda of anteriores) {
      centavos += Math.round(deuda.exigible * 100)
      if (deuda.negocioNombre?.trim()) negocios.add(deuda.negocioNombre.trim())
      for (const linea of deuda.productos) {
        if (!linea.producto || !Number.isSafeInteger(linea.cantidadEntregada) ||
            linea.cantidadEntregada <= 0) continue
        productos.set(linea.producto, (productos.get(linea.producto) ?? 0) + linea.cantidadEntregada)
      }
    }
    if (centavos <= 0) continue
    resultado.set(visible.id, {
      total: centavos / 100,
      pedidos: anteriores.length,
      productos: [...productos].map(([producto, cantidad]) => ({ producto, cantidad }))
        .sort((a, b) => a.producto.localeCompare(b.producto)),
      negocios: [...negocios].sort((a, b) => a.localeCompare(b)),
    })
  }
  return resultado
}
