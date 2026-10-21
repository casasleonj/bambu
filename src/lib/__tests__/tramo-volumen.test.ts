import { describe, it, expect } from 'vitest'
import { resolverTramoVolumen, formatoTramo } from '../tramo-volumen'

const tabla = [
  { cantMin: 1, cantMax: 3, precio: 3000 },
  { cantMin: 4, cantMax: 9, precio: 2800 },
  { cantMin: 10, cantMax: null, precio: 2600 },
]

describe('resolverTramoVolumen', () => {
  it('encuentra el tramo cuyo precio coincide con el guardado', () => {
    expect(resolverTramoVolumen(tabla, 5, 2800)).toEqual({ cantMin: 4, cantMax: 9 })
    expect(resolverTramoVolumen(tabla, 2, 3000)).toEqual({ cantMin: 1, cantMax: 3 })
    expect(resolverTramoVolumen(tabla, 25, 2600)).toEqual({ cantMin: 10, cantMax: null })
  })
  it('suma el sobrecosto de domicilio al comparar', () => {
    expect(resolverTramoVolumen(tabla, 5, 3000, 200)).toEqual({ cantMin: 4, cantMax: 9 })
  })
  it('no muestra tramo si la tabla cambió y el precio ya no coincide', () => {
    expect(resolverTramoVolumen(tabla, 5, 2700)).toBeNull()
  })
  it('sin tramo que cubra la cantidad → null', () => {
    expect(resolverTramoVolumen([{ cantMin: 4, cantMax: 9, precio: 2800 }], 2, 2800)).toBeNull()
  })
  it('en solapes gana el de mayor cantMin (igual que pricing.ts)', () => {
    const t = [{ cantMin: 1, cantMax: null, precio: 3000 }, { cantMin: 4, cantMax: null, precio: 2800 }]
    expect(resolverTramoVolumen(t, 5, 2800)).toEqual({ cantMin: 4, cantMax: null })
  })
})

describe('formatoTramo', () => {
  it('rangos, abierto y puntual', () => {
    expect(formatoTramo({ cantMin: 4, cantMax: 9 })).toBe('4–9 und')
    expect(formatoTramo({ cantMin: 10, cantMax: null })).toBe('10 o más und')
    expect(formatoTramo({ cantMin: 1, cantMax: 1 })).toBe('1 und')
  })
})
