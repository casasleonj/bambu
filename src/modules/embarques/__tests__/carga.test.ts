// @tests Carga value object
// Hallazgo cubierto: 4 fuentes de verdad para PESOS_KG
import { describe, it, expect } from 'vitest'
import { Carga, PESOS_KG } from '../domain/value-objects/Carga'

describe('Carga.pesoKg', () => {
  it('peso de 5 pacas agua + 3 pacas hielo + 2 botellones', () => {
    const carga = new Carga({
      PACA_AGUA: 5,
      PACA_HIELO: 3,
      BOTELLON: 2,
      BOLSA_AGUA: 0,
      BOLSA_HIELO: 0,
    })
    // 5 * 10 + 3 * 11 + 2 * 20 = 50 + 33 + 40 = 123
    expect(carga.pesoKg()).toBe(123)
  })

  it('peso de solo bolsas (fraccionario)', () => {
    const carga = new Carga({
      PACA_AGUA: 0,
      PACA_HIELO: 0,
      BOTELLON: 0,
      BOLSA_AGUA: 100,
      BOLSA_HIELO: 50,
    })
    // 100 * 0.25 + 50 * 0.55 = 25 + 27.5 = 52.5
    expect(carga.pesoKg()).toBe(52.5)
  })

  it('carga vacía = 0 kg', () => {
    expect(Carga.empty().pesoKg()).toBe(0)
  })
})

describe('Carga.totalUnidades', () => {
  it('suma todas las unidades correctamente', () => {
    const carga = new Carga({
      PACA_AGUA: 5,
      PACA_HIELO: 3,
      BOTELLON: 2,
      BOLSA_AGUA: 10,
      BOLSA_HIELO: 7,
    })
    expect(carga.totalUnidades()).toBe(27)
  })
})

describe('Carga.withProduct (inmutabilidad)', () => {
  it('retorna nueva Carga con producto actualizado sin mutar la original', () => {
    const original = new Carga({ PACA_AGUA: 5, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 })
    const nueva = original.withProduct('PACA_AGUA', 10)
    expect(original.PACA_AGUA).toBe(5)
    expect(nueva.PACA_AGUA).toBe(10)
  })
})

describe('Carga.isEmpty', () => {
  it('true si todas las cantidades son 0', () => {
    expect(Carga.empty().isEmpty()).toBe(true)
  })
  it('false si al menos una cantidad > 0', () => {
    const carga = new Carga({ PACA_AGUA: 1, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 })
    expect(carga.isEmpty()).toBe(false)
  })
})

describe('Carga.equals', () => {
  it('dos cargas con mismas cantidades son iguales', () => {
    const a = new Carga({ PACA_AGUA: 5, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 })
    const b = new Carga({ PACA_AGUA: 5, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 })
    expect(a.equals(b)).toBe(true)
  })
})

describe('PESOS_KG (constante)', () => {
  // Documenta los valores esperados. Si cambian, el sistema completo se afecta.
  it('valores deben coincidir con realidad física medida', () => {
    expect(PESOS_KG.PACA_AGUA).toBe(10.0)
    expect(PESOS_KG.PACA_HIELO).toBe(11.0)
    expect(PESOS_KG.BOTELLON).toBe(20.0)
    expect(PESOS_KG.BOLSA_AGUA).toBe(0.25)
    expect(PESOS_KG.BOLSA_HIELO).toBe(0.55)
  })
})
