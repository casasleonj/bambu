import { describe, it, expect } from 'vitest'
import { draftToPedidoBase, pedidoEntityToPedidoBase } from '../pedido-to-pedido-base'

describe('draftToPedidoBase', () => {
  const resolved = [
    { producto: 'PACA_AGUA', cantidad: 20, precio: 2300, subtotal: 46000, origen: 'volumen' as const },
    { producto: 'BOTELLON', cantidad: 3, precio: 9000, subtotal: 27000, origen: 'base' as const },
  ]

  it('mapea items[] a las columnas legacy; BOTELLON a la columna del canal', () => {
    const pb = draftToPedidoBase({ clienteId: 'c1', canal: 'DOMICILIO', resolvedItems: resolved, total: 73000, saldo: 73000, nowIso: '2026-09-07T10:00:00.000Z' })
    expect(pb.clienteId).toBe('c1')
    expect(pb.cPacaAguaPed).toBe(20)
    expect(pb.precioPacaAgua).toBe(2300)
    expect(pb.cBotellonDomPed).toBe(3)
    expect(pb.cBotellonFabPed).toBe(0)
    expect(pb.precioBotellonDom).toBe(9000)
    expect(Number(pb.total)).toBe(73000)
    expect(Number(pb.saldo)).toBe(73000)
    expect(pb.estadoEntrega).toBe('PENDIENTE')
    expect(pb.id).toBe('__preview__')
    expect(pb.numero).toBe(0)
  })

  it('canal PUNTO manda BOTELLON a la columna de fábrica', () => {
    const pb = draftToPedidoBase({ clienteId: 'c1', canal: 'PUNTO', resolvedItems: [{ producto: 'BOTELLON', cantidad: 5, precio: 8000, subtotal: 40000, origen: 'base' as const }], total: 40000, saldo: 0, nowIso: '2026-09-07T10:00:00.000Z' })
    expect(pb.cBotellonFabPed).toBe(5)
    expect(pb.cBotellonDomPed).toBe(0)
    expect(pb.precioBotellonFab).toBe(8000)
    expect(Number(pb.saldo)).toBe(0)
  })

  it('expone items[] con precioOrigen para la alerta de precio manual', () => {
    const pb = draftToPedidoBase({ clienteId: 'c1', canal: 'PUNTO', resolvedItems: [{ producto: 'PACA_AGUA', cantidad: 2, precio: 1000, subtotal: 2000, origen: 'manual' as const }], total: 2000, saldo: 2000, nowIso: '2026-09-07T10:00:00.000Z' })
    expect(pb.items?.[0]).toMatchObject({ producto: 'PACA_AGUA', cantPedido: 2, precio: 1000, precioOrigen: 'manual' })
  })
})

describe('pedidoEntityToPedidoBase', () => {
  it('mapea una entidad Pedido usando toLegacyFields() + getters', () => {
    const fakeEntity = {
      numero: 42,
      clienteId: 'c1',
      fecha: new Date('2026-09-01T08:00:00.000Z'),
      total: { toDecimal: () => 50000 },
      saldo: { toDecimal: () => 12000 },
      estadoEntrega: { get: () => 'ENTREGADO' },
      estadoPago: { get: () => 'PARCIAL' },
      toLegacyFields: () => ({ cPacaAguaPed: 10, precioPacaAgua: 2500, cBotellonDomPed: 2, precioBotellonDom: 9000 }),
    }
    const pb = pedidoEntityToPedidoBase(fakeEntity, 'p-123')
    expect(pb.id).toBe('p-123')
    expect(pb.numero).toBe(42)
    expect(pb.clienteId).toBe('c1')
    expect(pb.cPacaAguaPed).toBe(10)
    expect(pb.precioPacaAgua).toBe(2500)
    expect(pb.cBotellonDomPed).toBe(2)
    expect(pb.cPacaHieloPed).toBe(0)
    expect(Number(pb.total)).toBe(50000)
    expect(Number(pb.saldo)).toBe(12000)
    expect(pb.estadoEntrega).toBe('ENTREGADO')
    expect(pb.estadoPago).toBe('PARCIAL')
    expect(pb.fecha).toBe('2026-09-01T08:00:00.000Z')
  })
})
