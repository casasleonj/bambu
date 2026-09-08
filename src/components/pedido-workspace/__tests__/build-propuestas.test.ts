import { describe, it, expect } from 'vitest'
import { buildPropuestas } from '../build-propuestas'

describe('buildPropuestas', () => {
  it('deriva "repetir el pedido anterior" del pedido más reciente no anulado', () => {
    const props = buildPropuestas({
      pedidos: [
        { estadoEntrega: 'ANULADO', canal: 'PUNTO', items: [{ producto: 'PACA_AGUA', cantPedido: 99 }] },
        { estadoEntrega: 'ENTREGADO', canal: 'DOMICILIO', items: [
          { producto: 'PACA_AGUA', cantPedido: 3 },
          { producto: 'BOTELLON', cantPedido: 2 },
        ] },
      ],
    })
    const ultima = props.find((p) => p.id === 'ultima')
    expect(ultima).toBeDefined()
    expect(ultima!.canal).toBe('DOMICILIO')
    expect(ultima!.origin).toBe('HISTORY')
    expect(ultima!.lineas).toEqual([
      { producto: 'PACA_AGUA', cantidad: 3 },
      { producto: 'BOTELLON', cantidad: 2 },
    ])
  })

  it('deriva "patrón de consumo" y normaliza códigos legacy', () => {
    const props = buildPropuestas({
      productosSugeridos: [
        { codigo: 'cPacaAguaPed', nombre: 'Paca de Agua', cantidadPromedio: 4 },
        { codigo: 'cBotellonFabPed', nombre: 'Botellón Fábrica', cantidadPromedio: 1 },
        { codigo: 'cBotellonDomPed', nombre: 'Botellón Domicilio', cantidadPromedio: 2 },
      ],
    })
    const patron = props.find((p) => p.id === 'patron')
    expect(patron).toBeDefined()
    // los dos botellón legacy colapsan a un único BOTELLON sumado
    expect(patron!.lineas).toEqual([
      { producto: 'PACA_AGUA', cantidad: 4 },
      { producto: 'BOTELLON', cantidad: 3 },
    ])
  })

  it('ignora líneas con cantidad <= 0 y códigos desconocidos', () => {
    const props = buildPropuestas({
      pedidos: [{ estadoEntrega: 'ENTREGADO', canal: 'PUNTO', items: [
        { producto: 'PACA_AGUA', cantPedido: 0 },
        { producto: 'PRODUCTO_FANTASMA', cantPedido: 5 },
      ] }],
    })
    expect(props).toHaveLength(0)
  })

  it('sin datos → sin propuestas', () => {
    expect(buildPropuestas({})).toEqual([])
  })
})
