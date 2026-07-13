import { describe, it, expect } from 'vitest'
import { calcularEstadoPagoVisual, type PedidoSaldoInput } from '../visual-states'

function make(partial: Partial<PedidoSaldoInput>): PedidoSaldoInput {
  return {
    estadoPago: 'PENDIENTE',
    estadoEntrega: 'PENDIENTE',
    saldo: 0,
    total: 100_000,
    totalPagado: 0,
    ...partial,
  }
}

describe('calcularEstadoPagoVisual', () => {
  it('retorna PAGADO cuando totalPagado >= total', () => {
    const estado = calcularEstadoPagoVisual(make({ totalPagado: 100_000 }))
    expect(estado.key).toBe('PAGADO')
    expect(estado.label).toBe('Pagado')
    expect(estado.color).toBe('green')
    expect(estado.isMoney).toBe(false)
  })

  it('retorna PAGADO cuando estadoPago es PAGADO', () => {
    const estado = calcularEstadoPagoVisual(make({ estadoPago: 'PAGADO', saldo: 10_000 }))
    expect(estado.key).toBe('PAGADO')
    expect(estado.label).toBe('Pagado')
  })

  it('retorna PAGADO con label Anticipado cuando estadoPago es ANTICIPADO', () => {
    const estado = calcularEstadoPagoVisual(make({ estadoPago: 'ANTICIPADO' }))
    expect(estado.key).toBe('PAGADO')
    expect(estado.label).toBe('Anticipado')
  })

  it('retorna FIADO cuando entregado y saldo pendiente', () => {
    const estado = calcularEstadoPagoVisual(
      make({ estadoEntrega: 'ENTREGADO', saldo: 40_000 })
    )
    expect(estado.key).toBe('FIADO')
    expect(estado.label).toBe('Fiado')
    expect(estado.color).toBe('red')
    expect(estado.isMoney).toBe(true)
  })

  it('no retorna FIADO cuando no está entregado aunque saldo > 0', () => {
    const estado = calcularEstadoPagoVisual(
      make({ estadoEntrega: 'PENDIENTE', saldo: 40_000 })
    )
    expect(estado.key).toBe('PENDIENTE')
  })

  it('retorna PENDIENTE por defecto', () => {
    const estado = calcularEstadoPagoVisual(make({}))
    expect(estado.key).toBe('PENDIENTE')
    expect(estado.label).toBe('Pendiente')
    expect(estado.color).toBe('gray')
    expect(estado.isMoney).toBe(false)
  })

  it('retorna PENDIENTE para pago parcial antes de entrega', () => {
    const estado = calcularEstadoPagoVisual(
      make({ estadoEntrega: 'PENDIENTE', totalPagado: 50_000 })
    )
    expect(estado.key).toBe('PENDIENTE')
  })

  it('retorna ANULADO cuando estadoPago es ANULADO', () => {
    const estado = calcularEstadoPagoVisual(make({ estadoPago: 'ANULADO' }))
    expect(estado.key).toBe('ANULADO')
    expect(estado.label).toBe('Anulado')
    expect(estado.color).toBe('gray')
    expect(estado.isMoney).toBe(false)
  })

  it('retorna ANULADO cuando estadoEntrega es ANULADO', () => {
    const estado = calcularEstadoPagoVisual(make({ estadoEntrega: 'ANULADO' }))
    expect(estado.key).toBe('ANULADO')
    expect(estado.label).toBe('Anulado')
    expect(estado.color).toBe('gray')
  })

  it('NO retorna PAGADO cuando está anulado aunque totalPagado >= total', () => {
    const estado = calcularEstadoPagoVisual(
      make({
        estadoPago: 'ANULADO',
        estadoEntrega: 'ANULADO',
        total: 100_000,
        totalPagado: 100_000,
      })
    )
    expect(estado.key).toBe('ANULADO')
    expect(estado.color).toBe('gray')
  })
})
