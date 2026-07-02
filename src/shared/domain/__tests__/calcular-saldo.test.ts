import { describe, it, expect, vi } from 'vitest'
import { Money } from '../value-objects'
import { calcularSaldo } from '../calcular-saldo'

describe('calcularSaldo', () => {
  it('retorna el saldo cuando total es mayor que totalPagado', () => {
    const total = Money.fromDecimal(100_000)
    const totalPagado = Money.fromDecimal(40_000)
    const saldo = calcularSaldo(total, totalPagado)
    expect(saldo.cents).toBe(6_000_000)
    expect(saldo.toDecimal()).toBe(60_000)
  })

  it('retorna 0 cuando total es igual a totalPagado', () => {
    const total = Money.fromDecimal(50_000)
    const totalPagado = Money.fromDecimal(50_000)
    const saldo = calcularSaldo(total, totalPagado)
    expect(saldo.cents).toBe(0)
    expect(saldo.isZero()).toBe(true)
  })

  it('clampa a 0 cuando totalPagado es mayor que total', () => {
    const total = Money.fromDecimal(50_000)
    const totalPagado = Money.fromDecimal(60_000)
    const onOverpayment = vi.fn()
    const saldo = calcularSaldo(total, totalPagado, {
      callbacks: { onOverpayment },
    })
    expect(saldo.cents).toBe(0)
    expect(onOverpayment).toHaveBeenCalledTimes(1)
    expect(onOverpayment).toHaveBeenCalledWith(Money.fromDecimal(10_000))
  })

  it('no dispara onOverpayment cuando no hay overpayment', () => {
    const total = Money.fromDecimal(100_000)
    const totalPagado = Money.fromDecimal(50_000)
    const onOverpayment = vi.fn()
    calcularSaldo(total, totalPagado, { callbacks: { onOverpayment } })
    expect(onOverpayment).not.toHaveBeenCalled()
  })

  it('reporta inconsistencia cuando estadoPago=PAGADO pero saldo > 0', () => {
    const total = Money.fromDecimal(100_000)
    const totalPagado = Money.fromDecimal(50_000)
    const onInconsistencia = vi.fn()
    const saldo = calcularSaldo(total, totalPagado, {
      context: { estadoPago: 'PAGADO', pedidoId: 'p1' },
      callbacks: { onInconsistencia },
    })
    expect(saldo.cents).toBe(5_000_000)
    expect(onInconsistencia).toHaveBeenCalledTimes(1)
    expect(onInconsistencia).toHaveBeenCalledWith(Money.fromDecimal(50_000))
  })

  it('no reporta inconsistencia cuando estadoPago no es PAGADO', () => {
    const total = Money.fromDecimal(100_000)
    const totalPagado = Money.fromDecimal(50_000)
    const onInconsistencia = vi.fn()
    calcularSaldo(total, totalPagado, {
      context: { estadoPago: 'PARCIAL' },
      callbacks: { onInconsistencia },
    })
    expect(onInconsistencia).not.toHaveBeenCalled()
  })

  it('no reporta inconsistencia cuando estadoPago=PAGADO y saldo es 0', () => {
    const total = Money.fromDecimal(100_000)
    const totalPagado = Money.fromDecimal(100_000)
    const onInconsistencia = vi.fn()
    calcularSaldo(total, totalPagado, {
      context: { estadoPago: 'PAGADO' },
      callbacks: { onInconsistencia },
    })
    expect(onInconsistencia).not.toHaveBeenCalled()
  })

  it('maneja valores en 0', () => {
    const total = Money.fromDecimal(0)
    const totalPagado = Money.fromDecimal(0)
    const saldo = calcularSaldo(total, totalPagado)
    expect(saldo.cents).toBe(0)
  })
})
