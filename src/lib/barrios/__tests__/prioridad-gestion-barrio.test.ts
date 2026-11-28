import { describe, it, expect } from 'vitest'
import { nivelGestionBarrio, type PedidoGestionBarrio } from '../prioridad-gestion-barrio'

const ahora = new Date('2026-11-27T23:00:00.000Z')
const base: PedidoGestionBarrio = {
  estadoEntrega: 'PENDIENTE', saldo: 2000, fechaEntrega: null,
  items: [{ cantPedido: 10, cantEntrega: 0, cantRegaloPedido: 0, cantRegaloEntrega: 0 }],
}
const nivel = (changes: Partial<PedidoGestionBarrio>) => nivelGestionBarrio({ ...base, ...changes }, ahora)

describe('#859 prioridad operativa dentro del barrio (también en Recorrido)', () => {
  it('pendiente o parcial físico aparece antes que entregado aunque el entregado sea antiguo', () => {
    expect(nivel({ estadoEntrega: 'PENDIENTE' })).toBe(0)
    expect(nivel({ estadoEntrega: 'EN_RUTA' })).toBe(0)
    expect(nivel({ estadoEntrega: 'NO_ENTREGADO' })).toBe(0)
    expect(nivel({ items: [{ ...base.items[0], cantEntrega: 6 }] })).toBe(0)
    expect(nivel({ items: [{ ...base.items[0], cantPedido: 0, cantRegaloPedido: 2 }] })).toBe(0)
  })

  it('si una entrega ya terminó pero debe dinero, se gestiona antes de los totalmente terminados', () => {
    const items = [{ ...base.items[0], cantEntrega: 10 }]
    expect(nivel({ estadoEntrega: 'ENTREGADO', items, saldo: 1500 })).toBe(2)
    expect(nivel({ estadoEntrega: 'ENTREGADO', items, saldo: 0 })).toBe(3)
    expect(nivel({ estadoEntrega: 'ENTREGADO', items, saldo: -100 })).toBe(3)
  })

  it('entregas programadas a futuro no desplazan la demanda física exigible ahora', () => {
    expect(nivel({ fechaEntrega: new Date('2026-11-28T23:00:00Z') })).toBe(1)
    expect(nivel({ fechaEntrega: ahora })).toBe(0)
  })

  it('anulados y cancelados no ganan prioridad aunque conserven remanente y saldo', () => {
    expect(nivel({ estadoEntrega: 'ANULADO' })).toBe(4)
    expect(nivel({ estadoEntrega: 'CANCELADO' })).toBe(4)
  })

  it('pedido sin remanente pero con saldo por cobrar no se clasifica como terminado', () => {
    expect(nivel({ items: [{ ...base.items[0], cantEntrega: 10 }], saldo: 2500 })).toBe(2)
  })
})
