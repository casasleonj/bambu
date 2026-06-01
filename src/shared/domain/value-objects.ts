/**
 * Shared Value Objects — cross-domain primitives.
 *
 * These are immutable, self-validating types used across bounded contexts.
 */

export class Money {
  constructor(public readonly cents: number) {}

  static fromDecimal(value: number | string | unknown): Money {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value)
    if (isNaN(num)) return new Money(0)
    return new Money(Math.round(num * 100))
  }

  toDecimal(): number {
    return this.cents / 100
  }

  add(other: Money): Money {
    return new Money(this.cents + other.cents)
  }

  subtract(other: Money): Money {
    return new Money(this.cents - other.cents)
  }

  isPositive(): boolean {
    return this.cents > 0
  }

  isZero(): boolean {
    return this.cents === 0
  }

  toString(): string {
    return `$${this.toDecimal().toFixed(2)}`
  }
}

export class DateRange {
  constructor(
    public readonly start: Date,
    public readonly end: Date,
  ) {}

  static today(): DateRange {
    const now = new Date()
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)
    return new DateRange(start, end)
  }

  static yesterday(): DateRange {
    const today = new Date()
    const start = new Date(today)
    start.setDate(today.getDate() - 1)
    start.setHours(0, 0, 0, 0)
    const end = new Date(today)
    end.setDate(today.getDate() - 1)
    end.setHours(23, 59, 59, 999)
    return new DateRange(start, end)
  }
}

export type ProductCode = 'PACA_AGUA' | 'PACA_HIELO' | 'BOTELLON' | 'BOLSA_AGUA' | 'BOLSA_HIELO'

export const PRODUCT_LABELS: Record<ProductCode, string> = {
  PACA_AGUA: 'Paca Agua',
  PACA_HIELO: 'Paca Hielo',
  BOTELLON: 'Botellón',
  BOLSA_AGUA: 'Bolsa Agua',
  BOLSA_HIELO: 'Bolsa Hielo',
}
