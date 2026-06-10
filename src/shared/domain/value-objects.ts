import { getTodayString, startOfDayBogota, endOfDayBogota } from '@/lib/dates'

/**
 * Shared Value Objects — cross-domain primitives.
 *
 * These are immutable, self-validating types used across bounded contexts.
 */

/**
 * Money — value object basado en centavos enteros.
 *
 * FIX Fase 2 §3.2: el parser anterior usaba `parseFloat` directo, que en JS
 * interpreta `"5.000"` como `5` (no `5000`). En COP, el punto es separador
 * de miles, no decimal. Ahora: si llega string, se normaliza primero
 * (quitando puntos de miles y convirtiendo coma → punto), y luego se
 * parsea. Si llega number, se usa tal cual.
 *
 * Reglas:
 *  - number 1000   → 100000 cents
 *  - string "1000" → 100000 cents
 *  - string "1.000" → 100000 cents (COP, miles)
 *  - string "1.234,56" → 123456 cents (COP con decimales)
 *  - string "1,234.56" → 123456 cents (US con miles)
 *  - NaN/undefined → 0 cents
 */
export class Money {
  constructor(public readonly cents: number) {}

  static fromDecimal(value: number | string | unknown): Money {
    if (typeof value === 'string') {
      // Normalizar: detectar formato US vs CO y unificar
      const normalized = Money.normalizeNumericString(value)
      const num = Number(normalized)
      if (isNaN(num)) return new Money(0)
      return new Money(Math.round(num * 100))
    }
    const num = Number(value)
    if (isNaN(num)) return new Money(0)
    return new Money(Math.round(num * 100))
  }

  /**
   * Normaliza un string numérico con separadores de miles a formato canónico
   * (sin separadores, punto como decimal).
   * - "5.000"   → "5000"   (punto = miles, sin decimales)
   * - "1.234,56"→ "1234.56" (punto = miles, coma = decimal)
   * - "1,234.56"→ "1234.56" (coma = miles, punto = decimal)
   * - "1000"    → "1000"   (sin separadores)
   * - "10.50"   → "10.50"  (punto = decimal, sin miles)
   *
   * Heurística: si hay ambos (punto y coma), el último es el decimal.
   * Si solo hay punto y va seguido de exactamente 3 dígitos al final, es miles.
   * Si solo hay coma, es decimal (formato CO).
   */
  private static normalizeNumericString(input: string): string {
    const s = input.trim().replace(/[^\d.,-]/g, '')
    if (s === '' || s === '-' || s === '.' || s === ',') return '0'

    const hasDot = s.includes('.')
    const hasComma = s.includes(',')

    if (hasDot && hasComma) {
      // Ambos presentes: el último separador es el decimal
      const lastDot = s.lastIndexOf('.')
      const lastComma = s.lastIndexOf(',')
      if (lastComma > lastDot) {
        // Formato CO: "1.234,56" → coma es decimal
        return s.replace(/\./g, '').replace(',', '.')
      } else {
        // Formato US: "1,234.56" → punto es decimal
        return s.replace(/,/g, '')
      }
    }

    if (hasComma && !hasDot) {
      // Solo coma: probablemente decimal CO ("10,50")
      return s.replace(',', '.')
    }

    if (hasDot && !hasComma) {
      // Solo punto: ambigüedad. Si termina en .XXX (exactamente 3 dígitos),
      // es separador de miles COP ("5.000" → 5000). Si no, es decimal
      // US ("10.50" → 10.50).
      const match = s.match(/\.(\d+)$/)
      if (match && match[1].length === 3 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
        // Múltiples grupos de 3 después de puntos: "1.234.567" → 1234567
        return s.replace(/\./g, '')
      }
      if (match && match[1].length === 3 && /^\d+\.\d{3}$/.test(s)) {
        // Exactamente un grupo de 3 al final: "5.000" → 5000
        return s.replace(/\./g, '')
      }
      // Si no, tratar como decimal US: "10.50" → 10.50
      return s
    }

    return s
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

  // FIX Fase 2 §3.3: antes usaba setHours() naive (UTC en Vercel). En
  // servidor UTC, medianoche "local" son 5h después de medianoche Bogotá
  // → límites del día corridos. Ahora: delega a dates.ts que usa la zona
  // America/Bogota explícitamente.
  static today(): DateRange {
    const dateStr = getTodayString()
    return new DateRange(startOfDayBogota(dateStr), endOfDayBogota(dateStr))
  }

  static yesterday(): DateRange {
    // Ayer en Bogotá: restar 1 día a hoy (en zona Bogotá)
    const todayStr = getTodayString()
    const [y, m, d] = todayStr.split('-').map(Number)
    const yesterday = new Date(Date.UTC(y, m - 1, d - 1))
    const yesterdayStr = yesterday.toISOString().split('T')[0]
    return new DateRange(startOfDayBogota(yesterdayStr), endOfDayBogota(yesterdayStr))
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
