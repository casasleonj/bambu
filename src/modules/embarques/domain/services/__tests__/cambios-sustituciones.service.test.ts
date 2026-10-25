// @tests #446 — cambios = Σ sustituciones registradas (lógica pura).
import { describe, it, expect } from 'vitest'
import { agregarCambios, aplicarCambiosDeSustituciones } from '../cambios-sustituciones.service'

const retorno = (producto: string, cambios: number, devueltas = 0, rotas = 0) => ({ producto, devueltas, cambios, rotas })

describe('agregarCambios', () => {
  it('suma por producto y cuenta destinos', () => {
    const r = agregarCambios([
      { producto: 'PACA_AGUA', cantidad: 2, pedidoId: 'p1' },
      { producto: 'PACA_AGUA', cantidad: 1, clienteId: 'c1' },
      { producto: 'BOTELLON', cantidad: 3 },
    ])
    expect(r.porProducto).toEqual({ PACA_AGUA: 3, BOTELLON: 3 })
    expect(r.aClienteSinPedido).toBe(1)
    expect(r.sinDestino).toBe(1)
  })

  it('sin sustituciones: todo en cero', () => {
    expect(agregarCambios([])).toEqual({ porProducto: {}, sinDestino: 0, aClienteSinPedido: 0 })
  })
})

describe('aplicarCambiosDeSustituciones', () => {
  it('acepta cuando lo tecleado coincide con la suma', () => {
    const out = aplicarCambiosDeSustituciones([retorno('PACA_AGUA', 3, 1)], { PACA_AGUA: 3 })
    expect(out).toEqual([retorno('PACA_AGUA', 3, 1)])
  })

  it('el hueco del hallazgo: cambios 3 sin ninguna sustitución se rechaza', () => {
    expect(() => aplicarCambiosDeSustituciones([retorno('PACA_AGUA', 3)], {})).toThrow(/^CAMBIOS_NO_COINCIDEN/)
  })

  it('tecleó 0 pero hay sustituciones registradas: también se rechaza (no se corrige en silencio)', () => {
    expect(() => aplicarCambiosDeSustituciones([retorno('PACA_AGUA', 0)], { PACA_AGUA: 2 })).toThrow(/tecleaste 0, hay 2/)
  })

  it('agrega los productos con sustituciones que no venían en la lista', () => {
    const out = aplicarCambiosDeSustituciones([retorno('PACA_HIELO', 0)], { BOTELLON: 2 })
    expect(out).toContainEqual(retorno('BOTELLON', 2))
    expect(out).toHaveLength(2)
  })
})
