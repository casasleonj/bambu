import { describe, it, expect } from 'vitest'
import { asignarPagoFIFO, exigibleEsperado, exigibleDelPedido, validarInvariantesExigibles, type EntregaExigibleCalc } from '../entregas-exigibles'

const e = (id: string, dia: number, valor: number, asignado = 0): EntregaExigibleCalc => ({
  id, entregadoAt: new Date(2031, 3, dia), valorEntregado: valor, asignado,
})

describe('asignarPagoFIFO (#656)', () => {
  it('paga la entrega más antigua primero y luego la siguiente', () => {
    const r = asignarPagoFIFO([e('b', 4, 7500), e('a', 3, 7500)], 10000)
    expect(r.deltas.get('a')).toBe(7500)
    expect(r.deltas.get('b')).toBe(2500)
    expect(r.sobrante).toBe(0)
  })
  it('respeta lo ya asignado (no cobra dos veces la misma entrega)', () => {
    const r = asignarPagoFIFO([e('a', 3, 7500, 7500), e('b', 4, 7500)], 2000)
    expect(r.deltas.has('a')).toBe(false)
    expect(r.deltas.get('b')).toBe(2000)
  })
  it('reporta sobrante si el pago excede lo exigible', () => {
    const r = asignarPagoFIFO([e('a', 3, 1000)], 1500)
    expect(r.sobrante).toBe(500)
  })
})

describe('exigibleEsperado (regla 3)', () => {
  it('caso 693: 5 el día 3 y 10 el día 4 con 10.000 pagados → 12.500 de la segunda', () => {
    // valor entregado total 22.500; pagado 10.000; saldo 20.000 → exigible 12.500
    const entregas = [e('a', 3, 7500), e('b', 4, 15000)]
    expect(exigibleEsperado(entregas, { total: 30000, totalPagado: 10000, saldo: 20000 })).toBe(12500)
  })
  it('nunca supera el saldo del pedido', () => {
    expect(exigibleEsperado([e('a', 3, 9000)], { total: 9000, totalPagado: 0, saldo: 0 })).toBe(0)
  })
  it('nunca es negativo si lo pagado supera lo entregado (prepago)', () => {
    expect(exigibleEsperado([e('a', 3, 1000)], { total: 5000, totalPagado: 4000, saldo: 1000 })).toBe(0)
  })
})

describe('validarInvariantesExigibles', () => {
  it('pasa con un reparto consistente', () => {
    const entregas = [e('a', 3, 7500, 7500), e('b', 4, 15000, 2500)]
    expect(() => validarInvariantesExigibles(entregas, { total: 30000, totalPagado: 10000, saldo: 20000 })).not.toThrow()
  })
  it('falla si lo asignado excede lo pagado', () => {
    const entregas = [e('a', 3, 7500, 7500)]
    expect(() => validarInvariantesExigibles(entregas, { total: 7500, totalPagado: 0, saldo: 7500 })).toThrow(/excede totalPagado/)
  })
  it('falla si asignado supera el valor de la entrega', () => {
    const entregas = [e('a', 3, 1000, 1500)]
    expect(() => validarInvariantesExigibles(entregas, { total: 1000, totalPagado: 1500, saldo: 0 })).toThrow(/fuera de rango/)
  })
})

describe('exigibleDelPedido: transición sin filas (opción 2)', () => {
  it('pedido anterior ENTREGADO con saldo: el saldo es exigible', () => {
    expect(exigibleDelPedido([], { total: 8000, totalPagado: 0, saldo: 8000, estadoEntrega: 'ENTREGADO' })).toBe(8000)
  })
  it('pedido anterior parcial sin filas: no suma saldo no entregado', () => {
    expect(exigibleDelPedido([], { total: 30000, totalPagado: 0, saldo: 30000, estadoEntrega: 'PENDIENTE' })).toBe(0)
  })
  it('con filas, aplica la regla 3 y no el saldo completo', () => {
    const entregas = [{ id: 'a', entregadoAt: new Date(2031, 4, 3), valorEntregado: 7500, asignado: 7500 }]
    expect(exigibleDelPedido(entregas, { total: 30000, totalPagado: 7500, saldo: 22500, estadoEntrega: 'PENDIENTE' })).toBe(0)
  })
})
