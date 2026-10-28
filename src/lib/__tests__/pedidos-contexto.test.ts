import { describe, it, expect } from 'vitest'
import { vueltaAPedidos } from '../pedidos-contexto'
describe('regreso seguro a consulta de Pedidos', () => {
  it('conserva la pestaña y filtros al volver desde una factura', () => {
    const vuelta = '/pedidos?tab=fiados&fiadosPeriodo=todos&fiadosBuscar=Tienda%20Uno'
    expect(vueltaAPedidos(vuelta)).toBe(vuelta)
  })
  it.each([null, '', 'https://evil.example/pedidos', '//evil.example/pedidos', '/\\evil.example/pedidos', 'javascript:alert(1)', '/facturas', '/pedidos/otro'])('rechaza destinos ajenos: %s', value => {
    expect(vueltaAPedidos(value)).toBeNull()
  })
})
