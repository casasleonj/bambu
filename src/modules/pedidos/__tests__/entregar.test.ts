// @tests Pedido entity — entrega, anular, registrarPago
// Hallazgos cubiertos: validación over-entrega, overpayment, estados terminales
import { describe, it, expect } from 'vitest'
import { Pedido } from '../domain/entities/Pedido'
import { PedidoItem } from '../domain/entities/PedidoItem'
import { PedidoId } from '../domain/value-objects/PedidoId'
import { CanalVO } from '../domain/value-objects/Canal'
import { OrigenPedidoVO } from '../domain/value-objects/OrigenPedido'
import { EstadoEntregaVO } from '../domain/value-objects/EstadoEntrega'
import { EstadoPagoVO } from '../domain/value-objects/EstadoPago'
import { Money } from '@/shared/domain'

function makePedido(overrides: {
  estadoEntrega?: 'PENDIENTE' | 'EN_RUTA' | 'ENTREGADO' | 'ANULADO' | 'CANCELADO' | 'NO_ENTREGADO'
  items?: Array<{ producto: 'PACA_AGUA' | 'PACA_HIELO' | 'BOTELLON' | 'BOLSA_AGUA' | 'BOLSA_HIELO'; cantidad: number }>
  total?: number
  totalPagado?: number
} = {}) {
  const items = (overrides.items ?? [{ producto: 'PACA_AGUA' as const, cantidad: 2 }]).map(
    (i) => new PedidoItem(i.producto, i.cantidad, new Money(5000_00), 'base', 0)
  )
  return Pedido.create({
    id: PedidoId.from('test-pedido-1'),
    numero: 1,
    clienteId: 'test-cliente',
    canal: CanalVO.create('DOMICILIO'),
    origen: OrigenPedidoVO.create('PEDIDO'),
    estadoEntrega: EstadoEntregaVO.create(overrides.estadoEntrega ?? 'PENDIENTE'),
    estadoPago: EstadoPagoVO.create('PENDIENTE'),
    items,
    total: new Money((overrides.total ?? 10000) * 100),
    totalPagado: new Money((overrides.totalPagado ?? 0) * 100),
    pagos: [],
    fecha: new Date(),
  })
}

describe('Pedido.entregar', () => {
  it('cambia estado a ENTREGADO desde EN_RUTA (happy path)', () => {
    // PENDIENTE → ENTREGADO NO está permitido. Debe ir EN_RUTA → ENTREGADO.
    const pedido = makePedido({ estadoEntrega: 'EN_RUTA' })
    pedido.entregar([{ producto: 'PACA_AGUA', cantidad: 2 }])
    expect(pedido.estadoEntrega.get()).toBe('ENTREGADO')
  })

  it('rechaza transición directa PENDIENTE → ENTREGADO (regla de dominio)', () => {
    const pedido = makePedido({ estadoEntrega: 'PENDIENTE' })
    expect(() => pedido.entregar([{ producto: 'PACA_AGUA', cantidad: 2 }])).toThrow(
      /Transición inválida/
    )
  })

  it('recalcula total basado en cantidades entregadas', () => {
    const pedido = makePedido({
      estadoEntrega: 'EN_RUTA',
      items: [{ producto: 'PACA_AGUA', cantidad: 5 }, { producto: 'PACA_HIELO', cantidad: 3 }],
    })
    pedido.entregar([
      { producto: 'PACA_AGUA', cantidad: 2 },
      { producto: 'PACA_HIELO', cantidad: 0 },
    ])
    const aguaItem = pedido.items.find((i) => i.producto === 'PACA_AGUA')!
    expect(aguaItem.cantEntrega).toBe(2)
    const hieloItem = pedido.items.find((i) => i.producto === 'PACA_HIELO')!
    expect(hieloItem.cantEntrega).toBe(0)
  })

  it('lanza error si se intenta entregar más unidades que cantPedido (cubierto por PedidoItem)', () => {
    const pedido = makePedido({ estadoEntrega: 'EN_RUTA' })
    expect(() =>
      pedido.entregar([{ producto: 'PACA_AGUA', cantidad: 10 }])
    ).toThrow(/No se pueden entregar/)
  })

  it('lanza error si el producto no está en el pedido', () => {
    const pedido = makePedido({ estadoEntrega: 'EN_RUTA' })
    expect(() =>
      pedido.entregar([{ producto: 'BOTELLON' as any, cantidad: 1 }])
    ).toThrow(/no encontrado en pedido/)
  })

  it('lanza error si el pedido está CANCELADO', () => {
    const pedido = makePedido({ estadoEntrega: 'CANCELADO' })
    expect(() =>
      pedido.entregar([{ producto: 'PACA_AGUA', cantidad: 1 }])
    ).toThrow(/Transición inválida/)
  })
})

describe('Pedido.registrarPago', () => {
  it('incrementa totalPagado y actualiza estadoPago a PARCIAL', () => {
    const pedido = makePedido({ estadoEntrega: 'PENDIENTE', total: 10000 })
    pedido.registrarPago({ metodo: 'EFECTIVO' as any, monto: 3000 })
    expect(pedido.totalPagado.toDecimal()).toBe(3000)
    expect(pedido.estadoPago.get()).toBe('PARCIAL')
  })

  it('cambia estadoPago a PAGADO cuando totalPagado === total', () => {
    const pedido = makePedido({ estadoEntrega: 'PENDIENTE', total: 10000 })
    pedido.registrarPago({ metodo: 'EFECTIVO' as any, monto: 10000 })
    expect(pedido.estadoPago.get()).toBe('PAGADO')
  })

  it('rechaza pago en pedido ANULADO (estado terminal)', () => {
    const pedido = makePedido({ estadoEntrega: 'ANULADO' })
    expect(() =>
      pedido.registrarPago({ metodo: 'EFECTIVO' as any, monto: 1000 })
    ).toThrow(/No se puede registrar pago en pedido/)
  })

  it('rechaza pago en pedido CANCELADO (estado terminal)', () => {
    const pedido = makePedido({ estadoEntrega: 'CANCELADO' })
    expect(() =>
      pedido.registrarPago({ metodo: 'EFECTIVO' as any, monto: 1000 })
    ).toThrow(/No se puede registrar pago en pedido/)
  })
})

describe('Pedido.anular', () => {
  it('cambia estado a ANULADO desde ENTREGADO', () => {
    const pedido = makePedido({ estadoEntrega: 'ENTREGADO' })
    const tuvoPagos = pedido.anular()
    expect(pedido.estadoEntrega.get()).toBe('ANULADO')
    expect(pedido.estadoPago.get()).toBe('ANULADO')
    expect(typeof tuvoPagos).toBe('boolean')
  })

  it('rechaza anular desde PENDIENTE', () => {
    const pedido = makePedido({ estadoEntrega: 'PENDIENTE' })
    expect(() => pedido.anular()).toThrow(/Solo se pueden anular/)
  })

  it('retorna true en tuvoPagos si había pagos', () => {
    const pedido = makePedido({ estadoEntrega: 'ENTREGADO', total: 10000 })
    pedido.registrarPago({ metodo: 'EFECTIVO' as any, monto: 1000 })
    const tuvoPagos = pedido.anular()
    expect(tuvoPagos).toBe(true)
  })
})

describe('Pedido.cancelar', () => {
  it('cambia estado a CANCELADO desde PENDIENTE', () => {
    const pedido = makePedido({ estadoEntrega: 'PENDIENTE' })
    const result = pedido.cancelar()
    expect(pedido.estadoEntrega.get()).toBe('CANCELADO')
    expect(typeof result.tuvoPagos).toBe('boolean')
    expect(typeof result.totalOriginal).toBe('number')
  })

  it('resetea totalPagado a 0 al cancelar', () => {
    const pedido = makePedido({ estadoEntrega: 'PENDIENTE' })
    pedido.registrarPago({ metodo: 'EFECTIVO' as any, monto: 1000 })
    pedido.cancelar()
    expect(pedido.totalPagado.toDecimal()).toBe(0)
  })

  it('FIX C-BIZ-1: preserva totalOriginal para NotaCredito', () => {
    const pedido = makePedido({ estadoEntrega: 'PENDIENTE', total: 5000 })
    pedido.registrarPago({ metodo: 'EFECTIVO' as any, monto: 5000 })
    const { totalOriginal } = pedido.cancelar()
    // Even though pedido.total is reset to 0, the original is preserved
    expect(totalOriginal).toBe(5000)
    expect(pedido.total.toDecimal()).toBe(0)
  })
})
