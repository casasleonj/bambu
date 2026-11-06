import { describe, expect, it } from 'vitest'
import { comisionProduccionCorregida } from '../comision-produccion-correccion'

describe('#668 — corregir producción conserva tarifa histórica', () => {
  it('editar solo observaciones no revaloriza una producción', () => {
    expect(comisionProduccionCorregida(500, 165000, 500, 350)).toBe(165000)
  })
  it('corregir 500 a 400 usa 330 históricos, no 350 actuales', () => {
    expect(comisionProduccionCorregida(500, 165000, 400, 350)).toBe(132000)
  })
  it('conserva una tarifa histórica de cero', () => {
    expect(comisionProduccionCorregida(500, 0, 400, 350)).toBe(0)
  })
  it('corregir unidades a cero da comisión cero; no modifica pagos', () => {
    expect(comisionProduccionCorregida(500, 165000, 0, 350)).toBe(0)
  })
  it('si antes no había unidades usa tarifa actual para unidades nuevas', () => {
    expect(comisionProduccionCorregida(0, 0, 10, 330)).toBe(3300)
  })
  it('redondea dinero a centavos', () => {
    expect(comisionProduccionCorregida(3, 1, 2, 99)).toBe(0.67)
  })
})
