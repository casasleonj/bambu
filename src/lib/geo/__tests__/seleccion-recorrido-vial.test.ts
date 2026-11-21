import { describe, expect, it } from 'vitest'
import { clasificarGestionVial, type PedidoParaGestionVial } from '../seleccion-recorrido-vial'

const p = (v: Partial<PedidoParaGestionVial> = {}): PedidoParaGestionVial => ({
  estadoEntrega: 'PENDIENTE',
  canal: 'DOMICILIO',
  items: [{ producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 0, cantRegaloPedido: 0, cantRegaloEntrega: 0 }],
  exigible: 0,
  ...v,
})

describe('#930 elegibilidad de parada en ruta vial', () => {
  it('entrega pendiente pagada: se mantiene solo ENTREGA', () => {
    expect(clasificarGestionVial(p())).toEqual({
      tipo: 'ENTREGA', unidadesPendientes: 10, fiadoExigible: 0,
    })
  })
  it('parcial ayer y cobro exigible: una parada ENTREGA_Y_COBRO', () => {
    expect(clasificarGestionVial(p({ items: [{ producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 7 }], exigible: 9000 }))).toEqual({
      tipo: 'ENTREGA_Y_COBRO', unidadesPendientes: 3, fiadoExigible: 9000,
    })
  })
  it('entrega completada con fiado: incluir únicamente COBRO', () => {
    expect(clasificarGestionVial(p({ estadoEntrega: 'ENTREGADO',
      items: [{ producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 10 }], exigible: 7500 }))).toEqual({
      tipo: 'COBRO', unidadesPendientes: 0, fiadoExigible: 7500,
    })
  })
  it('entrega completamente pagada y anulados no generan visita', () => {
    expect(clasificarGestionVial(p({ estadoEntrega: 'ENTREGADO',
      items: [{ producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 10 }] }))).toBeNull()
    expect(clasificarGestionVial(p({ estadoEntrega: 'ANULADO', exigible: 5000 }))).toBeNull()
  })
  it('regalo pendiente también cuenta como producto físico a entregar', () => {
    expect(clasificarGestionVial(p({ items: [{
      producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 10,
      cantRegaloPedido: 3, cantRegaloEntrega: 1,
    }] }))?.unidadesPendientes).toBe(2)
  })
  it('pedidos de punto sin entrega domiciliaria no generan reparto, salvo gestión de cobro', () => {
    expect(clasificarGestionVial(p({ canal: 'PUNTO' }))).toBeNull()
    expect(clasificarGestionVial(p({ canal: 'PUNTO', exigible: 2000 }))).toEqual({
      tipo: 'COBRO', unidadesPendientes: 0, fiadoExigible: 2000,
    })
  })
  it('el estado ENTREGADO inconsistente no reenvía productos', () => {
    expect(() => clasificarGestionVial(p({ estadoEntrega: 'ENTREGADO' }))).toThrow('ENTREGA_POR_CONCILIAR')
  })
  it('sin items modernos puede usar cantidades legacy, pero jamás perder regalos modernos', () => {
    expect(clasificarGestionVial(p({ items: [], legacyPendientes: [{ pedidas: 8, entregadas: 5 }] }))?.unidadesPendientes).toBe(3)
  })
})
