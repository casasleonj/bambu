import { describe, expect, it } from 'vitest'
import { valorarEntregasDia } from '../ventas-entregadas.repository'

const linea = (pedidoId: string, cantidad: number, cantidadPrevia = 0) =>
  ({ pedidoId, producto: 'PACA_AGUA', cantidad, cantidadPrevia })
const pedido = (id: string, precio: number, canal = 'DOMICILIO') =>
  ({ id, canal, items: [{ producto: 'PACA_AGUA', precio }] })

describe('ventas entregadas por día #883', () => {
  it('reconstruye las 280 unidades del incidente, incluyendo las 50 de arrastre', () => {
    const origen = [
      ['hoy-dom-2300', 167, 2300, 'DOMICILIO'],
      ['hoy-punto-2300', 10, 2300, 'PUNTO'],
      ['hoy-dom-2500', 11, 2500, 'DOMICILIO'],
      ['hoy-punto-2500', 12, 2500, 'PUNTO'],
      ['hoy-2000', 20, 2000, 'PUNTO'],
      ['hoy-2800', 4, 2800, 'PUNTO'],
      ['hoy-3000', 6, 3000, 'DOMICILIO'],
      ['1147', 4, 2500, 'DOMICILIO'], ['1148', 5, 2500, 'DOMICILIO'],
      ['1153', 6, 2500, 'DOMICILIO'], ['1155', 10, 2300, 'DOMICILIO'],
      ['1224', 13, 2300, 'DOMICILIO'], ['1234', 12, 2300, 'DOMICILIO'],
    ] as const
    const r = valorarEntregasDia(origen.map(([id, cantidad]) => linea(id, cantidad)),
      origen.map(([id, , precio, canal]) => pedido(id, precio, canal)))
    expect(r.desglose.reduce((s, l) => s + l.cantidad, 0)).toBe(280)
    expect(r.total).toBe(651800)
    expect(r.sinPrecio).toBe(0)
    expect(r.desglose.filter(l => l.canal === 'DOMICILIO').reduce((s, l) => s + l.cantidad, 0)).toBe(234)
    expect(r.desglose.filter(l => l.canal === 'PUNTO').reduce((s, l) => s + l.cantidad, 0)).toBe(46)
    expect(r.desglose).toHaveLength(7)
    const vigente = origen.filter(([id]) => id !== '1224')
    const trasAnular = valorarEntregasDia(vigente.map(([id, cantidad]) => linea(id, cantidad)),
      vigente.map(([id, , precio, canal]) => pedido(id, precio, canal)))
    expect(trasAnular.desglose.reduce((s, l) => s + l.cantidad, 0)).toBe(267)
    expect(trasAnular.total).toBe(621900)
  })
  it('valora solamente delta de hoy y conserva redondeo entre parciales', () => {
    const p = [pedido('parcial', 0.335)]
    const ayer = valorarEntregasDia([linea('parcial', 1)], p)
    const hoy = valorarEntregasDia([linea('parcial', 1, 1)], p)
    expect(ayer.total).toBe(0.34)
    expect(hoy.total).toBe(0.33)
    expect(hoy.desglose[0].cantidad).toBe(1)
  })
  it('no inventa un precio ante ausencia o varias tarifas incompatibles', () => {
    const r = valorarEntregasDia([linea('sin', 3), linea('ambiguo', 2), linea('gratis', 1)],
      [{ ...pedido('ambiguo', 2300), items: [...pedido('ambiguo', 2300).items, ...pedido('ambiguo', 2500).items] }, pedido('gratis', 0)])
    expect(r.sinPrecio).toBe(5)
    expect(r.desglose).toEqual([{ producto: 'PACA_AGUA', canal: 'DOMICILIO', precio: 0, cantidad: 1, subtotal: 0 }])
  })
  it('conserva total comercial de legado completo sin inventar precio; no lo vuelve una venta cero', () => {
    const r = valorarEntregasDia([linea('legado', 4)],
      [{ id: 'legado', canal: 'PUNTO', items: [], totalCompleto: 9000 }])
    expect(r.total).toBe(9000)
    expect(r.sinPrecio).toBe(4)
    expect(r.desglose).toEqual([])
  })
  it('separa dos precios del mismo producto si todas las cantidades se entregaron dentro del rango', () => {
    const p = [{ id: 'mixto', canal: 'PUNTO', items: [
      { producto: 'PACA_AGUA', precio: 2300, cantEntrega: 2 },
      { producto: 'PACA_AGUA', precio: 2500, cantEntrega: 3 },
    ] }]
    const completo = valorarEntregasDia([linea('mixto', 2), linea('mixto', 3, 2)], p)
    expect(completo.total).toBe(12100)
    expect(completo.sinPrecio).toBe(0)
    const parcial = valorarEntregasDia([linea('mixto', 3, 2)], p)
    expect(parcial.sinPrecio).toBe(3)
    expect(parcial.desglose).toEqual([])
  })
})
