/**
 * EstadoPago Value Object.
 *
 * Encapsulates payment state transitions and validation.
 */

import type { EstadoPago, EstadoEntrega } from '../types'
import { ESTADOS_PAGO } from '../types'

/**
 * Tabla canónica de transiciones de pago. Fuente única de verdad —
 * `pedido-transitions.service` y la fachada legacy `src/lib/pedido-utils`
 * la re-exportan; nadie más la redefine (F2, INVENTARIO §F2).
 */
export const TRANSICIONES_PAGO: Record<EstadoPago, EstadoPago[]> = {
  PENDIENTE: ['PARCIAL', 'PAGADO', 'ANTICIPADO', 'ANULADO'],
  PARCIAL: ['PAGADO', 'ANTICIPADO', 'ANULADO'],
  PAGADO: ['ANULADO'],
  ANTICIPADO: ['PAGADO', 'ANULADO'],
  VENCIDO: ['PAGADO', 'PARCIAL', 'ANULADO'],
  ANULADO: [],
}

export class EstadoPagoVO {
  private constructor(private readonly value: EstadoPago) {}

  static from(estado: string): EstadoPagoVO {
    const normalized = estado as EstadoPago
    if (!ESTADOS_PAGO.includes(normalized)) {
      throw new Error(`EstadoPago inválido: ${estado}`)
    }
    return new EstadoPagoVO(normalized)
  }

  static create(estado: EstadoPago): EstadoPagoVO {
    return new EstadoPagoVO(estado)
  }

  /**
   * Proyecta `estadoPago` desde la fuente de verdad: `(total, totalPagado,
   * estadoEntrega)`. G5.1 / ADR-PEDIDO-ESTADO-CANONICO-001 §2.
   *
   * `ANTICIPADO` = el pago total se recibió ANTES de la entrega comprometida.
   * Para un pedido totalmente pagado eso equivale a `estadoEntrega ∈
   * {PENDIENTE, EN_RUTA}` (la entrega aún no ocurrió → el pago la antecede).
   * `VENCIDO` NO lo produce este helper — es un override del cron.
   */
  static proyectar(total: number, totalPagado: number, estadoEntrega: EstadoEntrega | string): EstadoPagoVO {
    if (estadoEntrega === 'CANCELADO' || estadoEntrega === 'ANULADO') {
      return new EstadoPagoVO('ANULADO')
    }
    if (totalPagado >= total) {
      // Entrega aún no ocurrida ⇒ el pago la antecede ⇒ ANTICIPADO.
      const preEntrega =
        estadoEntrega === 'PENDIENTE' ||
        estadoEntrega === 'EN_RUTA' ||
        estadoEntrega === 'NO_ENTREGADO'
      return new EstadoPagoVO(preEntrega ? 'ANTICIPADO' : 'PAGADO')
    }
    if (totalPagado > 0) return new EstadoPagoVO('PARCIAL')
    return new EstadoPagoVO('PENDIENTE')
  }

  /**
   * @deprecated Usar `proyectar(total, totalPagado, estadoEntrega)`. `fromTotals`
   * asume que la entrega ya ocurrió (nunca da `ANTICIPADO`) — solo correcto
   * para callers donde `estadoEntrega === 'ENTREGADO'`.
   */
  static fromTotals(total: number, totalPagado: number): EstadoPagoVO {
    return EstadoPagoVO.proyectar(total, totalPagado, 'ENTREGADO')
  }

  get(): EstadoPago {
    return this.value
  }

  canTransitionTo(next: EstadoPagoVO): boolean {
    return TRANSICIONES_PAGO[this.value]?.includes(next.value) ?? false
  }

  isPaid(): boolean {
    return this.value === 'PAGADO' || this.value === 'ANTICIPADO'
  }

  isAnulled(): boolean {
    return this.value === 'ANULADO'
  }

  equals(other: EstadoPagoVO): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
