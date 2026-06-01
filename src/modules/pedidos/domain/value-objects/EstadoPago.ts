/**
 * EstadoPago Value Object.
 *
 * Encapsulates payment state transitions and validation.
 */

import type { EstadoPago } from '../types'
import { ESTADOS_PAGO } from '../types'

const TRANSICIONES_PAGO: Record<EstadoPago, EstadoPago[]> = {
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

  static fromTotals(total: number, totalPagado: number): EstadoPagoVO {
    if (totalPagado >= total) return new EstadoPagoVO('PAGADO')
    if (totalPagado > 0) return new EstadoPagoVO('PARCIAL')
    return new EstadoPagoVO('PENDIENTE')
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
