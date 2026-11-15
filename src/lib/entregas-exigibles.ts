import { importeLineaCentavos } from '@/shared/domain/unit-price'
// #656 (fase fiado por entrega parcial). Lógica pura: sin Prisma, sin efectos.
// Regla: el saldo canónico es Pedido.saldo (= total − totalPagado). Las entregas exigibles solo REPARTEN ese saldo.
// Invariantes (se validan en servidor antes de confirmar cualquier cambio):
//  1. Σ asignado del pedido <= totalPagado.
//  2. 0 <= asignado <= valorEntregado por entrega.
//  3. Σ exigible = max(0, min(Σ valorEntregado − totalPagado, saldo)), donde exigible = valorEntregado − asignado.
//  4. El reparto de pagos sigue antigüedad (entregadoAt ascendente, desempate por id).

export interface EntregaExigibleCalc {
  id: string
  entregadoAt: Date
  valorEntregado: number
  asignado: number
}

const cent = (n: number) => Math.round(n * 100)
const orden = (a: EntregaExigibleCalc, b: EntregaExigibleCalc) =>
  +a.entregadoAt - +b.entregadoAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Exigible de cada entrega (en pesos, centavos exactos). */
export function exigibleDe(e: EntregaExigibleCalc): number {
  return (cent(e.valorEntregado) - cent(e.asignado)) / 100
}

/** Exigible esperado del pedido según la regla 3. */
export function exigibleEsperado(
  entregas: EntregaExigibleCalc[],
  pedido: { total: number; totalPagado: number; saldo: number },
): number {
  const valorEntregadoTotal = entregas.reduce((t, e) => t + cent(e.valorEntregado), 0)
  const pendienteDeCobro = valorEntregadoTotal - cent(pedido.totalPagado)
  return Math.max(0, Math.min(pendienteDeCobro, cent(pedido.saldo))) / 100
}

/**
 * Asigna un monto de pago a las entregas más antiguas primero. Devuelve el delta por entrega
 * y el sobrante que no tiene entrega exigible (no debe quedar si se respeta la regla 3).
 */
export function asignarPagoFIFO(
  entregas: EntregaExigibleCalc[],
  monto: number,
): { deltas: Map<string, number>; sobrante: number } {
  let restante = cent(monto)
  const deltas = new Map<string, number>()
  for (const e of [...entregas].sort(orden)) {
    if (restante <= 0) break
    const disponible = cent(e.valorEntregado) - cent(e.asignado)
    if (disponible <= 0) continue
    const tomar = Math.min(disponible, restante)
    deltas.set(e.id, tomar / 100)
    restante -= tomar
  }
  return { deltas, sobrante: restante / 100 }
}

/** Lanza si alguna invariante no se cumple. Se usa antes de confirmar la transacción. */
export function validarInvariantesExigibles(
  entregas: EntregaExigibleCalc[],
  pedido: { total: number; totalPagado: number; saldo: number },
): void {
  const sumaAsignado = entregas.reduce((t, e) => t + cent(e.asignado), 0)
  if (sumaAsignado > cent(pedido.totalPagado)) throw new Error('INVARIANTE: asignado excede totalPagado')
  for (const e of entregas) {
    if (cent(e.asignado) < 0 || cent(e.asignado) > cent(e.valorEntregado) || cent(e.valorEntregado) < 0)
      throw new Error(`INVARIANTE: asignado fuera de rango en entrega ${e.id}`)
  }
  const real = entregas.reduce((t, e) => t + cent(exigibleDe(e)), 0) / 100
  if (cent(real) !== cent(exigibleEsperado(entregas, pedido)))
    throw new Error('INVARIANTE: Σ exigible no coincide con min(valorEntregado − totalPagado, saldo)')
}

/**
 * Exigible total del pedido, con la regla de transición (decisión PO, opción 2):
 * - Con filas de entrega: aplica la regla 3.
 * - Sin filas (pedido anterior a la tabla): conserva el comportamiento actual, es decir, el saldo
 *   cuenta solo si el pedido está ENTREGADO. Un parcial viejo sin filas no suma saldo no entregado.
 */
export function exigibleDelPedido(
  entregas: EntregaExigibleCalc[],
  pedido: { total: number; totalPagado: number; saldo: number; estadoEntrega: string },
): number {
  if (['ANULADO', 'CANCELADO'].includes(pedido.estadoEntrega)) return 0
  if (pedido.estadoEntrega === 'ENTREGADO') return Math.max(0, pedido.saldo)
  if (entregas.length > 0) return exigibleEsperado(entregas, pedido)
  return pedido.estadoEntrega === 'ENTREGADO' && pedido.saldo > 0 ? pedido.saldo : 0
}

/** Recalcula desde cero: correcciones de pago y entregas retroactivas no conservan asignaciones viejas. */
export function proyectarPagoFIFO(entregas: EntregaExigibleCalc[], totalPagado: number): EntregaExigibleCalc[] {
  const base = entregas.map(e => ({ ...e, asignado: 0 }))
  const { deltas } = asignarPagoFIFO(base, totalPagado)
  return base.sort(orden).map(e => ({ ...e, asignado: deltas.get(e.id) ?? 0 }))
}

interface HechoEntrega { valorEntregado: unknown; lineas?: unknown }
interface ItemVigente { producto: string; cantEntrega: number; precio: unknown }
export interface PedidoExigible {
  total: unknown; totalPagado: unknown; saldo: unknown; estadoEntrega: string
  items: ItemVigente[]; entregasExigibles: HechoEntrega[]
}

/** Hechos nuevos por producto, valorados al precio comercial vigente y acotados al cumplimiento actual.
 * Las filas anteriores sin detalle conservan su valor histórico; no se inventan productos ni fechas.
 */
export function calcularExigibleVigente(p: PedidoExigible): number {
  if (['ANULADO', 'CANCELADO'].includes(p.estadoEntrega)) return 0
  const saldo = Math.max(0, cent(Number(p.saldo)))
  if (p.estadoEntrega === 'ENTREGADO') return saldo / 100
  if (!p.entregasExigibles.length) return 0
  const cantidades = new Map<string, number>()
  let historico = 0
  for (const e of p.entregasExigibles) {
    if (!Array.isArray(e.lineas) || !e.lineas.length) { historico += cent(Number(e.valorEntregado)); continue }
    for (const l of e.lineas) {
      if (!l || typeof l !== 'object' || typeof l.producto !== 'string' ||
          typeof l.cantidad !== 'number' || !Number.isSafeInteger(l.cantidad) || l.cantidad < 0)
        throw new Error('ENTREGA_EXIGIBLE_INVALIDA')
      cantidades.set(l.producto, (cantidades.get(l.producto) ?? 0) + l.cantidad)
    }
  }
  const valorActual = p.items.reduce((sum, i) => sum + importeLineaCentavos(i.precio, Math.max(0, i.cantEntrega)), 0)
  const porAsignar = new Map(cantidades)
  const valorRegistrado = p.items.reduce((sum, i) => {
    const cantidad = Math.min(Math.max(0, i.cantEntrega), porAsignar.get(i.producto) ?? 0)
    porAsignar.set(i.producto, Math.max(0, (porAsignar.get(i.producto) ?? 0) - cantidad))
    return sum + importeLineaCentavos(i.precio, cantidad)
  }, historico)
  return Math.max(0, Math.min(saldo, Math.min(valorActual, valorRegistrado) - cent(Number(p.totalPagado)))) / 100
}
