// @tests ADR-CIERRE-002 §1-2 — cobertura exacta de pedidos en el cierre (lógica pura)
import { describe, it, expect } from 'vitest'
import { validarCoberturaPedidos, esPedidoEntregable, type PedidoDelEmbarque } from '../cobertura-pedidos.service'

const ped = (id: string, numero: number, estadoEntrega = 'EN_RUTA', estado = 'EN_RUTA'): PedidoDelEmbarque => ({ id, numero, estadoEntrega, estado })

describe('esPedidoEntregable', () => {
  it('cancelado y anulado no son entregables, ni por estadoEntrega ni por estado', () => {
    expect(esPedidoEntregable({ estadoEntrega: 'CANCELADO', estado: 'EN_RUTA' })).toBe(false)
    expect(esPedidoEntregable({ estadoEntrega: 'EN_RUTA', estado: 'ANULADO' })).toBe(false)
    expect(esPedidoEntregable({ estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO' })).toBe(true)
  })
})

describe('validarCoberturaPedidos', () => {
  const embarque = [ped('a', 1), ped('b', 2)]

  it('cobertura exacta: no lanza', () => {
    expect(() => validarCoberturaPedidos(embarque, ['a', 'b'])).not.toThrow()
    expect(() => validarCoberturaPedidos(embarque, ['b', 'a'])).not.toThrow()
  })

  it('embarque sin pedidos y payload vacío: no lanza', () => {
    expect(() => validarCoberturaPedidos([], [])).not.toThrow()
  })

  it('falta un pedido vigente: PEDIDOS_SIN_RESOLVER con su número', () => {
    expect(() => validarCoberturaPedidos(embarque, ['a'])).toThrow(/^PEDIDOS_SIN_RESOLVER: .*#2/)
  })

  it('payload vacío con pedidos vigentes: PEDIDOS_SIN_RESOLVER', () => {
    expect(() => validarCoberturaPedidos(embarque, [])).toThrow(/^PEDIDOS_SIN_RESOLVER/)
  })

  it('pedido de otro embarque: PEDIDO_FUERA_DEL_EMBARQUE', () => {
    expect(() => validarCoberturaPedidos(embarque, ['a', 'b', 'x'])).toThrow(/^PEDIDO_FUERA_DEL_EMBARQUE: x/)
  })

  it('pedido repetido: PEDIDO_DUPLICADO (antes de cualquier otra regla)', () => {
    expect(() => validarCoberturaPedidos(embarque, ['a', 'a', 'b'])).toThrow(/^PEDIDO_DUPLICADO/)
  })

  it('cancelado en el payload: PEDIDO_NO_ENTREGABLE', () => {
    const e = [ped('a', 1), ped('c', 3, 'CANCELADO', 'CANCELADO')]
    expect(() => validarCoberturaPedidos(e, ['a', 'c'])).toThrow(/^PEDIDO_NO_ENTREGABLE: .*#3/)
  })

  it('cancelado/anulado que sigue asignado y NO viene en el payload: no cuenta como pendiente', () => {
    const e = [ped('a', 1), ped('c', 3, 'CANCELADO', 'CANCELADO'), ped('d', 4, 'ANULADO', 'ANULADO')]
    expect(() => validarCoberturaPedidos(e, ['a'])).not.toThrow()
  })

  it('un pedido ya ENTREGADO en modo vivo sigue siendo vigente: debe venir en el payload', () => {
    const e = [ped('a', 1, 'ENTREGADO', 'ENTREGADO')]
    expect(() => validarCoberturaPedidos(e, [])).toThrow(/^PEDIDOS_SIN_RESOLVER/)
    expect(() => validarCoberturaPedidos(e, ['a'])).not.toThrow()
  })
})
