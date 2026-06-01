/**
 * Canal Value Object.
 *
 * Represents the sales channel (PUNTO = on-premise, DOMICILIO = delivery).
 */

import type { Canal } from '../types'
import { CANALES } from '../types'

export class CanalVO {
  private constructor(private readonly value: Canal) {}

  static from(canal: string): CanalVO {
    const normalized = canal as Canal
    if (!CANALES.includes(normalized)) {
      throw new Error(`Canal inválido: ${canal}`)
    }
    return new CanalVO(normalized)
  }

  static create(canal: Canal): CanalVO {
    return new CanalVO(canal)
  }

  get(): Canal {
    return this.value
  }

  isDelivery(): boolean {
    return this.value === 'DOMICILIO'
  }

  isPoint(): boolean {
    return this.value === 'PUNTO'
  }

  equals(other: CanalVO): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
