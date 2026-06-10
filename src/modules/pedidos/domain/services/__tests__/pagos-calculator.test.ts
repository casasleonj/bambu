// @tests pagos-calculator — Fase 2 §3.4 fix verification
// Hallazgo cubierto: normalizarPagos truncaba el excedente en silencio.
// La plata del cliente se perdía sin registro. Ahora devuelve
// { pagosAplicados, excedente } explícitamente.

import { describe, it, expect } from 'vitest'
import { normalizarPagos, calcularSaldo, agruparPagosPorMetodo, calcularEstadoPago } from '@/modules/pedidos/domain/services/pagos-calculator.service'

describe('Fase 2 §3.4: normalizarPagos devuelve excedente explícito', () => {
  it('sin excedente: pagosAplicados tiene todos, excedente = 0', () => {
    const result = normalizarPagos(
      [
        { metodo: 'EFECTIVO', monto: 5000 },
        { metodo: 'TRANSFERENCIA', monto: 3000 },
      ],
      10000,
    )
    expect(result.excedente).toBe(0)
    expect(result.pagosAplicados).toHaveLength(2)
    expect(result.pagosAplicados[0].monto).toBe(5000)
    expect(result.pagosAplicados[1].monto).toBe(3000)
  })

  it('FIX §3.4: pago igual al total → excedente 0, pago completo', () => {
    const result = normalizarPagos(
      [{ metodo: 'EFECTIVO', monto: 8000 }],
      8000,
    )
    expect(result.excedente).toBe(0)
    expect(result.pagosAplicados).toHaveLength(1)
    expect(result.pagosAplicados[0].monto).toBe(8000)
  })

  it('FIX §3.4: pago mayor al total → excedente explícito (no se trunca en silencio)', () => {
    const result = normalizarPagos(
      [{ metodo: 'EFECTIVO', monto: 10000 }],
      8000,
    )
    expect(result.excedente).toBe(2000) // 10000 - 8000
    expect(result.pagosAplicados).toHaveLength(1)
    expect(result.pagosAplicados[0].monto).toBe(8000) // se aplica el total
  })

  it('FIX §3.4: múltiples pagos con excedente en el último', () => {
    const result = normalizarPagos(
      [
        { metodo: 'EFECTIVO', monto: 5000 },
        { metodo: 'TRANSFERENCIA', monto: 5000 },
      ],
      8000,
    )
    expect(result.excedente).toBe(2000) // 10000 - 8000
    expect(result.pagosAplicados).toHaveLength(2)
    expect(result.pagosAplicados[0].monto).toBe(5000)
    expect(result.pagosAplicados[1].monto).toBe(3000) // truncado a 3000
  })

  it('FIX §3.4: pago muy grande vs pedido chico → excedente exacto', () => {
    const result = normalizarPagos(
      [
        { metodo: 'EFECTIVO', monto: 1000 },
        { metodo: 'EFECTIVO', monto: 50000 },
      ],
      3000,
    )
    expect(result.excedente).toBe(48000) // 51000 - 3000
    expect(result.pagosAplicados).toHaveLength(2)
    expect(result.pagosAplicados[0].monto).toBe(1000)
    expect(result.pagosAplicados[1].monto).toBe(2000) // truncado
  })

  it('FIX §3.4: filtra pagos con monto <= 0', () => {
    const result = normalizarPagos(
      [
        { metodo: 'EFECTIVO', monto: 0 },
        { metodo: 'TRANSFERENCIA', monto: 5000 },
        { metodo: 'NEQUI', monto: -100 },
      ],
      10000,
    )
    expect(result.excedente).toBe(0)
    expect(result.pagosAplicados).toHaveLength(1)
    expect(result.pagosAplicados[0].metodo).toBe('TRANSFERENCIA')
  })

  it('FIX §3.4: sin pagos → excedente 0, sin aplicados', () => {
    const result = normalizarPagos([], 5000)
    expect(result.excedente).toBe(0)
    expect(result.pagosAplicados).toHaveLength(0)
  })
})

describe('Fase 2 §3.1: cálculo de saldo y estado de pago', () => {
  it('calcularSaldo nunca devuelve negativo', () => {
    expect(calcularSaldo(100, 50)).toBe(50)
    expect(calcularSaldo(100, 100)).toBe(0)
    expect(calcularSaldo(100, 150)).toBe(0) // cap a 0
  })

  it('calcularEstadoPago: totalPagado = total → PAGADO', () => {
    expect(calcularEstadoPago(1000, 1000)).toBe('PAGADO')
  })

  it('calcularEstadoPago: totalPagado > 0 y < total → PARCIAL', () => {
    expect(calcularEstadoPago(1000, 500)).toBe('PARCIAL')
  })

  it('calcularEstadoPago: totalPagado = 0 → PENDIENTE', () => {
    expect(calcularEstadoPago(1000, 0)).toBe('PENDIENTE')
  })

  it('calcularEstadoPago: totalPagado > total → PAGADO (no Anticipado)', () => {
    // El excedente va a saldo a favor; el estado de pago del pedido
    // debe reflejar PAGADO.
    expect(calcularEstadoPago(1000, 1500)).toBe('PAGADO')
  })
})

describe('Fase 2: agruparPagosPorMetodo', () => {
  it('suma por método correctamente', () => {
    const result = agruparPagosPorMetodo([
      { metodo: 'EFECTIVO', monto: 1000 },
      { metodo: 'EFECTIVO', monto: 500 },
      { metodo: 'TRANSFERENCIA', monto: 2000 },
    ])
    expect(result.EFECTIVO).toBe(1500)
    expect(result.TRANSFERENCIA).toBe(2000)
    expect(result.NEQUI).toBeUndefined()
  })
})
