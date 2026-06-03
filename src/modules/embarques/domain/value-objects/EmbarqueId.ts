/**
 * EmbarqueId Value Object.
 *
 * Strongly-typed identifier for Embarque aggregates.
 *
 * Invariante: value debe ser un string no-vacío y no-whitespace.
 * Para placeholders temporales en entidades nuevas, usar `EmbarqueId.empty()`
 * explícitamente (que retorna un sentinel). Esto previene que IDs vacíos
 * "accidentales" se filtren al dominio.
 */

import { randomBytes } from 'node:crypto'

export class EmbarqueId {
  constructor(public readonly value: string) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error('EmbarqueId must be a non-empty string')
    }
  }

  static from(value: string): EmbarqueId {
    return new EmbarqueId(value)
  }

  /**
   * Sentinel para entidades nuevas antes de persistir.
   * Usar explícitamente; nunca pasar string vacío a `from()`.
   */
  static empty(): EmbarqueId {
    // FIX F4.5: ya no permitimos que el constructor acepte ''.
    // Usamos un prefijo reconocible + randomBytes (CSPRNG) para que
    // un placeholder nunca colisione con un ID real persistido.
    return new EmbarqueId(`__placeholder_${randomBytes(8).toString('hex')}__`)
  }

  isEmpty(): boolean {
    return this.value.startsWith('__placeholder_')
  }

  toString(): string {
    return this.value
  }

  equals(other: EmbarqueId): boolean {
    return this.value === other.value
  }
}
