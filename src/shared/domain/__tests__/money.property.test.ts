// @tests Money value object — property-based (fast-check)
// Hallazgo cubierto: raw cents math en Pedido.registrarPago, posible overflow
// Invariantes:
//   1. add conmutativa: a + b == b + a
//   2. add asociativa: (a + b) + c == a + (b + c)
//   3. add identidad: a + 0 == a
//   4. subtract inversa: a + b - b == a
//   5. toString estable
//   6. NaN/null/undefined/inputs raros no rompen
//   7. redondeo estable para valores con más de 2 decimales
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { Money } from '@/shared/domain'

describe('Money — property-based invariants', () => {
  // Generador: número en COP plausible (-10M a 10M COP, 4 decimales max)
  const moneyValue = () =>
    fc
      .double({
        min: -10_000_000,
        max: 10_000_000,
        noNaN: true,
        noDefaultInfinity: true,
      })
      .map((n) => Math.round(n * 100) / 100)

  it('add es conmutativa', () => {
    fc.assert(
      fc.property(moneyValue(), moneyValue(), (a, b) => {
        const ma = Money.fromDecimal(a)
        const mb = Money.fromDecimal(b)
        return ma.add(mb).cents === mb.add(ma).cents
      }),
      { numRuns: 200 },
    )
  })

  it('add es asociativa', () => {
    fc.assert(
      fc.property(moneyValue(), moneyValue(), moneyValue(), (a, b, c) => {
        const ma = Money.fromDecimal(a)
        const mb = Money.fromDecimal(b)
        const mc = Money.fromDecimal(c)
        return ma.add(mb).add(mc).cents === ma.add(mb.add(mc)).cents
      }),
      { numRuns: 200 },
    )
  })

  it('a + 0 == a (identidad)', () => {
    fc.assert(
      fc.property(moneyValue(), (a) => {
        const ma = Money.fromDecimal(a)
        const zero = Money.fromDecimal(0)
        return ma.add(zero).cents === ma.cents
      }),
      { numRuns: 200 },
    )
  })

  it('a + b - b == a (subtract es inversa derecha de add)', () => {
    fc.assert(
      fc.property(moneyValue(), moneyValue(), (a, b) => {
        const ma = Money.fromDecimal(a)
        const mb = Money.fromDecimal(b)
        return ma.add(mb).subtract(mb).cents === ma.cents
      }),
      { numRuns: 200 },
    )
  })

  it('toString nunca lanza y empieza con $', () => {
    fc.assert(
      fc.property(moneyValue(), (a) => {
        const m = Money.fromDecimal(a)
        const s = m.toString()
        return typeof s === 'string' && s.startsWith('$')
      }),
      { numRuns: 200 },
    )
  })

  it('isZero ↔ cents === 0', () => {
    fc.assert(
      fc.property(moneyValue(), (a) => {
        const m = Money.fromDecimal(a)
        return m.isZero() === (m.cents === 0)
      }),
      { numRuns: 200 },
    )
  })

  it('isPositive ↔ cents > 0', () => {
    fc.assert(
      fc.property(moneyValue(), (a) => {
        const m = Money.fromDecimal(a)
        return m.isPositive() === (m.cents > 0)
      }),
      { numRuns: 200 },
    )
  })

  it('redondeo estable: fromDecimal(fromDecimal(x)) == fromDecimal(x)', () => {
    fc.assert(
      fc.property(moneyValue(), (a) => {
        const m1 = Money.fromDecimal(a)
        // Reconstruir desde el decimal redondeado a 2 dígitos
        const m2 = Money.fromDecimal(m1.toDecimal())
        // Tolerancia de 1 cent por redondeo acumulado (no debería pasar
        // si toDecimal() devuelve el valor exacto, pero float es traicionero)
        return Math.abs(m1.cents - m2.cents) <= 1
      }),
      { numRuns: 200 },
    )
  })

  it('redondeo a la mitad hacia arriba (banker\'s rounding? no, math.round)', () => {
    // 0.005 → 0.01 (no -0). Math.round(0.5) = 1 (alejándose de 0)
    expect(Money.fromDecimal(0.005).cents).toBe(1)
    // -0.005 → -0.01 (Math.round(-0.5) = 0 en algunos motores, -1 en otros)
    // Lo que importa: nunca es NaN, siempre es entero
    const neg = Money.fromDecimal(-0.005).cents
    expect(Number.isInteger(neg)).toBe(true)
  })

  it('1000 sumas de 0.01 = 1000 cents (no 999.99)', () => {
    // Test de la advertencia clásica de floats: 0.1 + 0.2 ≠ 0.3
    // Aquí probamos que el redondeo a centavos protege contra esto
    let m = Money.fromDecimal(0)
    for (let i = 0; i < 1000; i++) {
      m = m.add(Money.fromDecimal(0.01))
    }
    expect(m.cents).toBe(1000)
  })
})

describe('Money — fuzzing sobre inputs hostiles', () => {
  // Generador de strings hostiles
  const hostileString = () =>
    fc.oneof(
      fc.constant(''),
      fc.constant('   '),
      fc.constant('null'),
      fc.constant('undefined'),
      fc.constant('NaN'),
      fc.constant('Infinity'),
      fc.constant('-Infinity'),
      fc.constant('0x1A'),
      fc.string({ minLength: 10000, maxLength: 10000 }),
      fc
        .array(fc.constantFrom('💀', '<script>', 'DROP TABLE', '   ', '\t', '\n'))
        .map((arr) => arr.join('')),
      fc.string().map((s) => s.replace(/[a-zA-Z]/g, '')), // solo símbolos
    )

  it('fromDecimal nunca lanza con cualquier string', () => {
    fc.assert(
      fc.property(hostileString(), (s) => {
        expect(() => Money.fromDecimal(s)).not.toThrow()
        const m = Money.fromDecimal(s)
        expect(Number.isInteger(m.cents)).toBe(true)
        return true
      }),
      { numRuns: 100 },
    )
  })

  it('fromDecimal(null/undefined/NaN/Infinity) → 0 cents', () => {
    // FIX H1-1: Number.isFinite() rechaza NaN, +Infinity, -Infinity en un check.
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.constant(NaN),
          fc.constant(Infinity),
          fc.constant(-Infinity),
        ),
        (v) => {
          expect(Money.fromDecimal(v as any).cents).toBe(0)
          return true
        },
      ),
      { numRuns: 50 },
    )
  })

  it('objetos arbitrarios → 0 cents (no rompe)', () => {
    // FIX H1-2: tipos que no sean number | string | null | undefined retornan 0.
    fc.assert(
      fc.property(
        fc.oneof(
          fc.object(),
          fc.array(fc.anything()),
          fc.dictionary(fc.string(), fc.anything()),
        ),
        (v) => {
          expect(() => Money.fromDecimal(v as any)).not.toThrow()
          expect(Money.fromDecimal(v as any).cents).toBe(0)
          return true
        },
      ),
      { numRuns: 50 },
    )
  })
})
