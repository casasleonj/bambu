/**
 * MetodoPago Value Object.
 */

import type { MetodoPago } from '../types'
import { METODOS_PAGO } from '../types'

export class MetodoPagoVO {
  private constructor(private readonly value: MetodoPago) {}

  static from(metodo: string): MetodoPagoVO {
    const normalized = metodo as MetodoPago
    if (!METODOS_PAGO.includes(normalized)) {
      throw new Error(`MetodoPago inválido: ${metodo}`)
    }
    return new MetodoPagoVO(normalized)
  }

  static create(metodo: MetodoPago): MetodoPagoVO {
    return new MetodoPagoVO(metodo)
  }

  get(): MetodoPago {
    return this.value
  }

  equals(other: MetodoPagoVO): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
