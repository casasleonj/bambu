/**
 * EstadoEntrega Value Object.
 *
 * Encapsulates delivery state transitions and validation.
 * Immutable and self-validating.
 */

import type { EstadoEntrega } from '../types'
import { ESTADOS_ENTREGA } from '../types'

const TRANSICIONES: Record<EstadoEntrega, EstadoEntrega[]> = {
  PENDIENTE: ['EN_RUTA', 'CANCELADO'],
  EN_RUTA: ['ENTREGADO', 'NO_ENTREGADO', 'PENDIENTE', 'CANCELADO'],
  ENTREGADO: ['ANULADO'],
  NO_ENTREGADO: ['PENDIENTE', 'EN_RUTA', 'CANCELADO'],
  CANCELADO: [],
  ANULADO: [],
}

export class EstadoEntregaVO {
  private constructor(private readonly value: EstadoEntrega) {}

  static from(estado: string): EstadoEntregaVO {
    const normalized = estado as EstadoEntrega
    if (!ESTADOS_ENTREGA.includes(normalized)) {
      throw new Error(`EstadoEntrega inválido: ${estado}`)
    }
    return new EstadoEntregaVO(normalized)
  }

  static create(estado: EstadoEntrega): EstadoEntregaVO {
    return new EstadoEntregaVO(estado)
  }

  get(): EstadoEntrega {
    return this.value
  }

  canTransitionTo(next: EstadoEntregaVO): boolean {
    return TRANSICIONES[this.value]?.includes(next.value) ?? false
  }

  isTerminal(): boolean {
    return this.value === 'CANCELADO' || this.value === 'ANULADO'
  }

  isDelivered(): boolean {
    return this.value === 'ENTREGADO'
  }

  equals(other: EstadoEntregaVO): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
