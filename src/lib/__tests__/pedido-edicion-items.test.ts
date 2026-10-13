import { describe, it, expect } from 'vitest'
import { itemsCambiaron, lineaSinCambio } from '../pedido-edicion-items'

const previas = [
  { producto: 'PACA_AGUA', cantidad: 4, precio: 2800, precioOrigen: 'base' },
  { producto: 'BOTELLON', cantidad: 2, precio: 9000, precioOrigen: 'manual' },
]

describe('itemsCambiaron — regla compartida cliente/servidor', () => {
  it('mismas líneas (con o sin precio manual repetido) → sin cambio', () => {
    expect(itemsCambiaron(previas, [
      { producto: 'PACA_AGUA', cantidad: 4 },
      { producto: 'BOTELLON', cantidad: 2, precioManual: 9000 },
    ])).toBe(false)
  })

  it('el orden no importa; líneas con cantidad 0 se ignoran', () => {
    expect(itemsCambiaron(previas, [
      { producto: 'BOTELLON', cantidad: 2, precioManual: 9000 },
      { producto: 'PACA_AGUA', cantidad: 4 },
      { producto: 'PACA_HIELO', cantidad: 0 },
    ])).toBe(false)
  })

  it.each([
    ['otra cantidad', [{ producto: 'PACA_AGUA', cantidad: 5 }, { producto: 'BOTELLON', cantidad: 2, precioManual: 9000 }]],
    ['línea nueva', [{ producto: 'PACA_AGUA', cantidad: 4 }, { producto: 'BOTELLON', cantidad: 2, precioManual: 9000 }, { producto: 'PACA_HIELO', cantidad: 1 }]],
    ['línea quitada', [{ producto: 'PACA_AGUA', cantidad: 4 }]],
    ['precio manual distinto', [{ producto: 'PACA_AGUA', cantidad: 4 }, { producto: 'BOTELLON', cantidad: 2, precioManual: 8000 }]],
    ['precio manual sobre una línea que no era manual', [{ producto: 'PACA_AGUA', cantidad: 4, precioManual: 2800 }, { producto: 'BOTELLON', cantidad: 2, precioManual: 9000 }]],
  ])('%s → cambió', (_n, sol) => {
    expect(itemsCambiaron(previas, sol)).toBe(true)
  })

  it('lineaSinCambio: línea inexistente → cambio', () => {
    expect(lineaSinCambio(undefined, { cantidad: 1 })).toBe(false)
  })
})
