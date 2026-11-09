// @tests #696 — textos y lectura del saldo a favor de una fila de cliente.
import { describe, it, expect } from 'vitest'
import { saldoFavorDeFila } from '../saldo-favor-textos'

describe('saldoFavorDeFila', () => {
  it('lee números y textos decimales', () => {
    expect(saldoFavorDeFila({ saldoFavor: 4000 })).toBe(4000)
    expect(saldoFavorDeFila({ saldoFavor: '1500.50' })).toBe(1500.5)
  })
  it('sin dato, cero, negativo o ilegible es 0', () => {
    expect(saldoFavorDeFila({})).toBe(0)
    expect(saldoFavorDeFila({ saldoFavor: null })).toBe(0)
    expect(saldoFavorDeFila({ saldoFavor: -5 })).toBe(0)
    expect(saldoFavorDeFila({ saldoFavor: 'abc' })).toBe(0)
  })
})
