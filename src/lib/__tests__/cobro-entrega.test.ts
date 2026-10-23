import { describe, it, expect } from 'vitest'
import { calcularCobroEntrega } from '../cobro-entrega'

const base = { saldo: 100_000, deudaAceptada: false, esAnonimo: false }

describe('calcularCobroEntrega (#318)', () => {
  it('cobra todo → PAGADO y permitido aunque la oficina no haya aceptado deuda', () => {
    const r = calcularCobroEntrega({ ...base, monto: 100_000 })
    expect(r).toMatchObject({ estado: 'PAGADO', restante: 0, permitido: true })
  })

  it('cobra de más → se limita al saldo (nunca cobra más de lo que se debe)', () => {
    const r = calcularCobroEntrega({ ...base, monto: 1_000_000 })
    expect(r).toMatchObject({ montoAplicado: 100_000, restante: 0, estado: 'PAGADO' })
  })

  it('monto negativo o NaN se trata como 0', () => {
    expect(calcularCobroEntrega({ ...base, monto: -5 }).montoAplicado).toBe(0)
    expect(calcularCobroEntrega({ ...base, monto: Number.NaN }).montoAplicado).toBe(0)
  })

  it('parcial sin deuda aceptada → bloqueado FIADO_NO_AUTORIZADO (opción A: no se entrega)', () => {
    const r = calcularCobroEntrega({ ...base, monto: 60_000 })
    expect(r).toMatchObject({ estado: 'PARCIAL', restante: 40_000, permitido: false, motivoBloqueo: 'FIADO_NO_AUTORIZADO' })
  })

  it('parcial con deuda aceptada por la oficina → permitido', () => {
    const r = calcularCobroEntrega({ ...base, monto: 60_000, deudaAceptada: true })
    expect(r).toMatchObject({ estado: 'PARCIAL', restante: 40_000, permitido: true })
  })

  it('sin cobro con deuda aceptada → FIADO permitido', () => {
    const r = calcularCobroEntrega({ ...base, monto: 0, deudaAceptada: true })
    expect(r).toMatchObject({ estado: 'FIADO', restante: 100_000, permitido: true })
  })

  it('venta anónima nunca puede dejar deuda, ni con deuda aceptada', () => {
    const r = calcularCobroEntrega({ ...base, monto: 10_000, deudaAceptada: true, esAnonimo: true })
    expect(r).toMatchObject({ permitido: false, motivoBloqueo: 'VENTA_ANONIMA' })
  })

  it('saldo 0 (ya prepagado) → PAGADO sin cobrar nada', () => {
    const r = calcularCobroEntrega({ saldo: 0, monto: 0, deudaAceptada: false, esAnonimo: false })
    expect(r).toMatchObject({ estado: 'PAGADO', permitido: true, montoAplicado: 0 })
  })

  it('no acumula error de punto flotante', () => {
    const r = calcularCobroEntrega({ saldo: 0.3, monto: 0.1 + 0.2, deudaAceptada: false, esAnonimo: false })
    expect(r.restante).toBe(0)
  })
})
