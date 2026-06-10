// @tests Money value object
// Hallazgo cubierto: raw cents math en Pedido.registrarPago, posible overflow
import { describe, it, expect } from 'vitest'
import { Money } from '@/shared/domain'

describe('Money.fromDecimal', () => {
  it('convierte 10.50 a 1050 cents', () => {
    expect(Money.fromDecimal(10.50).cents).toBe(1050)
  })
  it('convierte string "5000" a 500000 cents', () => {
    expect(Money.fromDecimal('5000').cents).toBe(500000)
  })
  it('maneja NaN como 0', () => {
    expect(Money.fromDecimal(NaN).cents).toBe(0)
  })
  it('redondea correctamente (5000.005 → 500001 cents)', () => {
    expect(Money.fromDecimal(5000.005).cents).toBe(500001)
  })
  // FIX Fase 2 §3.2: casos COP (separador de miles = punto)
  it('FIX §3.2: "5.000" (COP miles) → 500000 cents, NO 500', () => {
    // Bug original: parseFloat("5.000") = 5 → 500 cents (INCORRECTO)
    expect(Money.fromDecimal('5.000').cents).toBe(500000)
  })
  it('FIX §3.2: "1.234.567" (COP millones) → 123456700 cents', () => {
    expect(Money.fromDecimal('1.234.567').cents).toBe(123456700)
  })
  it('FIX §3.2: "1.234,56" (COP miles+decimal) → 123456 cents', () => {
    expect(Money.fromDecimal('1.234,56').cents).toBe(123456)
  })
  it('FIX §3.2: "1,234.56" (US miles+decimal) → 123456 cents', () => {
    expect(Money.fromDecimal('1,234.56').cents).toBe(123456)
  })
  it('FIX §3.2: "10,50" (CO decimal) → 1050 cents', () => {
    expect(Money.fromDecimal('10,50').cents).toBe(1050)
  })
  it('FIX §3.2: "10.50" (US decimal) → 1050 cents (sigue funcionando)', () => {
    expect(Money.fromDecimal('10.50').cents).toBe(1050)
  })
  it('FIX §3.2: "$ 5.000" (con símbolo y espacio) → 500000 cents', () => {
    expect(Money.fromDecimal('$ 5.000').cents).toBe(500000)
  })
  it('FIX §3.2: number 5000 → 500000 cents', () => {
    expect(Money.fromDecimal(5000).cents).toBe(500000)
  })
  it('FIX §3.2: string vacío → 0 cents', () => {
    expect(Money.fromDecimal('').cents).toBe(0)
  })
  it('FIX §3.2: "abc" → 0 cents', () => {
    expect(Money.fromDecimal('abc').cents).toBe(0)
  })
  it('FIX §3.2: null → 0 cents', () => {
    expect(Money.fromDecimal(null).cents).toBe(0)
  })
  it('FIX §3.2: undefined → 0 cents', () => {
    expect(Money.fromDecimal(undefined).cents).toBe(0)
  })
})

describe('Money.toDecimal', () => {
  it('convierte 1050 cents a 10.50', () => {
    expect(Money.fromDecimal(10.50).toDecimal()).toBe(10.5)
  })
})

describe('Money.add', () => {
  it('suma dos Money', () => {
    const a = Money.fromDecimal(10.50)
    const b = Money.fromDecimal(5.25)
    expect(a.add(b).toDecimal()).toBe(15.75)
  })
})

describe('Money.subtract', () => {
  it('resta dos Money', () => {
    const a = Money.fromDecimal(10.50)
    const b = Money.fromDecimal(5.25)
    expect(a.subtract(b).toDecimal()).toBe(5.25)
  })

  it('permite resultado negativo (deuda)', () => {
    const a = Money.fromDecimal(5)
    const b = Money.fromDecimal(10)
    expect(a.subtract(b).cents).toBe(-500)
  })
})

describe('Money.isPositive / isZero', () => {
  it('isPositive true si > 0', () => {
    expect(Money.fromDecimal(0.01).isPositive()).toBe(true)
  })
  it('isZero true si === 0', () => {
    expect(new Money(0).isZero()).toBe(true)
  })
  it('isPositive false si 0', () => {
    expect(new Money(0).isPositive()).toBe(false)
  })
})

describe('Money.toString', () => {
  it('formato con símbolo $', () => {
    expect(Money.fromDecimal(10.50).toString()).toBe('$10.50')
  })
})
