import { describe, it, expect } from 'vitest'
import { estimarTotalOffline } from '../estimar-total'

const tabla = {
  PACA_AGUA: [
    { cantMin: 1, cantMax: 9, precio: 2500 },
    { cantMin: 10, cantMax: null, precio: 2300 },
  ],
}
const configs = [{ codigo: 'PACA_AGUA', aplicaDomicilio: true, sobreCostoDomicilio: 200 }]

describe('estimarTotalOffline (B-20)', () => {
  it('usa el tramo por cantidad', () => {
    expect(estimarTotalOffline([{ producto: 'PACA_AGUA', cantidad: 3 }], 'PUNTO', tabla, configs)).toBe(7500)
    expect(estimarTotalOffline([{ producto: 'PACA_AGUA', cantidad: 10 }], 'PUNTO', tabla, configs)).toBe(23000)
  })
  it('suma el recargo de domicilio solo en DOMICILIO', () => {
    expect(estimarTotalOffline([{ producto: 'PACA_AGUA', cantidad: 3 }], 'DOMICILIO', tabla, configs)).toBe(8100)
  })
  it('el precio manual manda y no lleva recargo', () => {
    expect(estimarTotalOffline([{ producto: 'PACA_AGUA', cantidad: 2, precioManual: 2000 }], 'DOMICILIO', tabla, configs)).toBe(4000)
  })
  it('sin tabla cargada no inventa precios: null', () => {
    expect(estimarTotalOffline([{ producto: 'PACA_AGUA', cantidad: 3 }], 'PUNTO', {}, [])).toBeNull()
  })
  it('sin productos: null', () => {
    expect(estimarTotalOffline([], 'PUNTO', tabla, configs)).toBeNull()
  })
})
