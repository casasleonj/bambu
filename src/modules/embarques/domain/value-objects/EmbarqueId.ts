/**
 * EmbarqueId Value Object.
 *
 * Strongly-typed identifier for Embarque aggregates.
 */

export class EmbarqueId {
  constructor(public readonly value: string) {
    if (value === '') {
      // Allow empty string as placeholder for new entities
      return
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error('EmbarqueId must be a non-empty string')
    }
  }

  static from(value: string): EmbarqueId {
    return new EmbarqueId(value)
  }

  static empty(): EmbarqueId {
    return new EmbarqueId('')
  }

  isEmpty(): boolean {
    return this.value === ''
  }

  toString(): string {
    return this.value
  }

  equals(other: EmbarqueId): boolean {
    return this.value === other.value
  }
}
