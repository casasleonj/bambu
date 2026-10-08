/**
 * Regularización de entregas no registradas (2026-10).
 *
 * Pedidos que se entregaron físicamente pero nunca se marcaron como
 * entregados en la app. El negocio confirmó (2026-10-08) que se entregaron
 * el mismo día en que se crearon y que los que estaban sin pagar se cobraron
 * en efectivo al entregar.
 *
 * La app no tiene camino para entregar un pedido sin embarque (la transición
 * canónica es PENDIENTE → EN_RUTA → ENTREGADO y EN_RUTA se alcanza al
 * asignarlo a un embarque). No se inventan embarques históricos: el script
 * hace el paso a EN_RUTA de forma administrativa, sin embarque, y la entrega
 * pasa por `EntregarPedidoUseCase`.
 *
 * Este módulo es PURO: valida el ledger (decisiones humanas) contra el estado
 * real de cada pedido y arma el input del flujo canónico de entrega
 * (`EntregarPedidoUseCase`). Nunca decide un pago por su cuenta: el método y
 * el monto vienen del ledger, y cualquier diferencia con la base de datos es
 * un CONFLICTO que detiene ese pedido.
 */

import type { ProductCode } from '@/shared/domain'

export type DecisionPago = 'YA_PAGADO' | 'EFECTIVO_TOTAL'

export interface EntradaLedgerEntrega {
  pedidoId: string
  /** Solo referencia humana: `Pedido.numero` NO es único en producción. */
  numero: number
  /** Total esperado del pedido; si la BD difiere → CONFLICTO. */
  total: number
  pago: DecisionPago
}

export interface PedidoParaRegularizar {
  id: string
  numero: number
  estadoEntrega: string
  estadoPago: string
  total: number
  totalPagado: number
  embarqueId: string | null
  entregaOfflineId: string | null
  createdAt: Date
  items: Array<{ producto: string; cantPedido: number; cantEntrega: number }>
}

export interface PlanEntrega {
  pedidoId: string
  offlineId: string
  entregadoAt: string
  itemsEntregados: Array<{ producto: ProductCode; cantidad: number }>
  pagos: Array<{ metodo: 'EFECTIVO'; monto: number }>
}

export type ResultadoPlan =
  | { tipo: 'PLAN'; plan: PlanEntrega }
  | { tipo: 'YA_REGULARIZADO' }
  | { tipo: 'CONFLICTO'; motivo: string }

export const PREFIJO_OFFLINE_ID = 'regul-entrega-2026-10'

export function offlineIdRegularizacion(pedidoId: string): string {
  return `${PREFIJO_OFFLINE_ID}:${pedidoId}`
}

const PRODUCTOS: readonly string[] = ['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO']

/** Compara montos en centavos para no depender de la representación decimal. */
function cents(n: number): number {
  return Math.round(n * 100)
}

export function validarLedger(ledger: unknown): EntradaLedgerEntrega[] {
  if (!Array.isArray(ledger) || ledger.length === 0) {
    throw new Error('Ledger vacío o inválido: se esperaba un array no vacío')
  }
  const vistos = new Set<string>()
  return ledger.map((raw, i) => {
    const e = raw as Partial<EntradaLedgerEntrega>
    if (typeof e.pedidoId !== 'string' || e.pedidoId.trim() === '') {
      throw new Error(`Ledger[${i}]: pedidoId requerido`)
    }
    if (vistos.has(e.pedidoId)) throw new Error(`Ledger[${i}]: pedidoId duplicado ${e.pedidoId}`)
    vistos.add(e.pedidoId)
    if (typeof e.numero !== 'number' || !Number.isInteger(e.numero)) {
      throw new Error(`Ledger[${i}]: numero requerido`)
    }
    if (typeof e.total !== 'number' || !(e.total > 0)) {
      throw new Error(`Ledger[${i}]: total debe ser > 0`)
    }
    if (e.pago !== 'YA_PAGADO' && e.pago !== 'EFECTIVO_TOTAL') {
      throw new Error(`Ledger[${i}]: pago debe ser YA_PAGADO o EFECTIVO_TOTAL`)
    }
    return { pedidoId: e.pedidoId, numero: e.numero, total: e.total, pago: e.pago }
  })
}

/**
 * Decide qué hacer con un pedido. Reglas:
 * - Ya entregado por esta regularización (mismo offlineId) → YA_REGULARIZADO.
 * - Cualquier otro estado distinto de PENDIENTE, total distinto, asignado a
 *   un embarque o con entregas parciales → CONFLICTO (revisión humana).
 * - `YA_PAGADO` exige el pedido pagado por completo; `EFECTIVO_TOTAL` exige
 *   el pedido sin ningún pago previo (nunca se completa un saldo parcial).
 */
export function planificarEntrega(
  entrada: EntradaLedgerEntrega,
  pedido: PedidoParaRegularizar | null,
): ResultadoPlan {
  if (!pedido) return { tipo: 'CONFLICTO', motivo: 'Pedido no encontrado' }

  const offlineId = offlineIdRegularizacion(pedido.id)
  if (pedido.estadoEntrega === 'ENTREGADO') {
    return pedido.entregaOfflineId === offlineId
      ? { tipo: 'YA_REGULARIZADO' }
      : { tipo: 'CONFLICTO', motivo: 'Ya estaba ENTREGADO por otro camino' }
  }
  // EN_RUTA sin embarque solo puede venir de una corrida previa de este
  // script que se cortó entre el paso a EN_RUTA y la entrega: se retoma.
  const retomable = pedido.estadoEntrega === 'EN_RUTA' && !pedido.embarqueId
  if (pedido.estadoEntrega !== 'PENDIENTE' && !retomable) {
    return { tipo: 'CONFLICTO', motivo: `estadoEntrega ${pedido.estadoEntrega}` }
  }
  if (pedido.numero !== entrada.numero) {
    return { tipo: 'CONFLICTO', motivo: `numero ${pedido.numero} ≠ ledger ${entrada.numero}` }
  }
  if (cents(pedido.total) !== cents(entrada.total)) {
    return { tipo: 'CONFLICTO', motivo: `total ${pedido.total} ≠ ledger ${entrada.total}` }
  }
  if (pedido.embarqueId) {
    return { tipo: 'CONFLICTO', motivo: 'Asignado a un embarque: debe cerrarse por el embarque' }
  }
  if (pedido.items.length === 0) return { tipo: 'CONFLICTO', motivo: 'Pedido sin items' }
  for (const it of pedido.items) {
    if (!PRODUCTOS.includes(it.producto)) {
      return { tipo: 'CONFLICTO', motivo: `Producto desconocido ${it.producto}` }
    }
    if (it.cantEntrega !== 0) {
      return { tipo: 'CONFLICTO', motivo: `Entrega parcial previa en ${it.producto}` }
    }
  }

  let pagos: PlanEntrega['pagos'] = []
  if (entrada.pago === 'YA_PAGADO') {
    if (cents(pedido.totalPagado) !== cents(pedido.total)) {
      return { tipo: 'CONFLICTO', motivo: `Ledger dice YA_PAGADO pero totalPagado=${pedido.totalPagado}` }
    }
  } else {
    if (cents(pedido.totalPagado) !== 0) {
      return { tipo: 'CONFLICTO', motivo: `Ledger dice EFECTIVO_TOTAL pero ya tiene pagos (${pedido.totalPagado})` }
    }
    pagos = [{ metodo: 'EFECTIVO', monto: pedido.total }]
  }

  return {
    tipo: 'PLAN',
    plan: {
      pedidoId: pedido.id,
      offlineId,
      // "Entregado el mismo día que se creó": se usa el instante de creación.
      entregadoAt: pedido.createdAt.toISOString(),
      itemsEntregados: pedido.items
        .filter(it => it.cantPedido > 0)
        .map(it => ({ producto: it.producto as ProductCode, cantidad: it.cantPedido })),
      pagos,
    },
  }
}
