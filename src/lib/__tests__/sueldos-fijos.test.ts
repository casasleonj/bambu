// @tests #644 — fechas de pago del sueldo fijo (semanal, quincenal, mensual, fechas elegidas) y «lo que toca».
import { describe, it, expect } from 'vitest'
import { fechasDePago, sueldosQueTocan, validarPlanPago } from '../sueldos-fijos'

describe('#644 — fechasDePago', () => {
  it('sin frecuencia no hay fechas (comportamiento anterior)', () => {
    expect(fechasDePago({ frecuenciaPago: null, diasPago: [] }, '2026-11-01', '2026-11-30')).toEqual([])
  })
  it('semanal: cada sábado del rango, extremos incluidos', () => {
    // 2026-11-07 y 2026-11-14 son sábados
    expect(fechasDePago({ frecuenciaPago: 'SEMANAL', diasPago: [6] }, '2026-11-07', '2026-11-14')).toEqual(['2026-11-07', '2026-11-14'])
    expect(fechasDePago({ frecuenciaPago: 'SEMANAL', diasPago: [6] }, '2026-11-08', '2026-11-13')).toEqual([])
  })
  it('quincenal: el 15 y el último día de cada mes (febrero incluido)', () => {
    const q = { frecuenciaPago: 'QUINCENAL', diasPago: [] } as const
    expect(fechasDePago(q, '2026-11-01', '2026-11-30')).toEqual(['2026-11-15', '2026-11-30'])
    expect(fechasDePago(q, '2027-02-01', '2027-02-28')).toEqual(['2027-02-15', '2027-02-28'])
    expect(fechasDePago(q, '2026-12-16', '2027-01-15')).toEqual(['2026-12-31', '2027-01-15'])
  })
  it('mensual: un día del mes; el 31 se paga el último día de los meses cortos', () => {
    const m = { frecuenciaPago: 'MENSUAL', diasPago: [31] } as const
    expect(fechasDePago(m, '2026-10-01', '2026-12-31')).toEqual(['2026-10-31', '2026-11-30', '2026-12-31'])
  })
  it('fechas elegidas: varios días del mes, sin repetir', () => {
    const f = { frecuenciaPago: 'FECHAS', diasPago: [5, 20, 5] } as const
    expect(fechasDePago(f, '2026-11-01', '2026-12-10')).toEqual(['2026-11-05', '2026-11-20', '2026-12-05'])
  })
  it('un rango invertido no devuelve fechas', () => {
    expect(fechasDePago({ frecuenciaPago: 'QUINCENAL', diasPago: [] }, '2026-11-30', '2026-11-01')).toEqual([])
  })
})

describe('#644 — sueldosQueTocan', () => {
  const plan = { frecuenciaPago: 'QUINCENAL', diasPago: [] } as const
  it('lista las fechas cumplidas sin cubrir, con el monto de cada pago', () => {
    const r = sueldosQueTocan(plan, 400000, '2026-11-20', () => false, 10)
    expect(r).toEqual([{ fecha: '2026-11-15', monto: 400000 }])
  })
  it('no lista las cubiertas por una nómina ni las futuras', () => {
    expect(sueldosQueTocan(plan, 400000, '2026-11-20', (f) => f === '2026-11-15', 10)).toEqual([])
    expect(sueldosQueTocan(plan, 400000, '2026-11-14', () => false, 10)).toEqual([])
  })
  it('no cuenta como pendientes las fechas anteriores a cuando rige el plan', () => {
    expect(sueldosQueTocan(plan, 400000, '2026-11-30', () => false, 31, '2026-11-16')).toEqual([{ fecha: '2026-11-30', monto: 400000 }])
    expect(sueldosQueTocan(plan, 400000, '2026-11-30', () => false, 31, '2026-11-15').map((s) => s.fecha)).toEqual(['2026-11-15', '2026-11-30'])
  })
  it('sin sueldo o sin frecuencia no toca nada', () => {
    expect(sueldosQueTocan(plan, 0, '2026-11-20', () => false)).toEqual([])
    expect(sueldosQueTocan({ frecuenciaPago: null, diasPago: [] }, 400000, '2026-11-20', () => false)).toEqual([])
  })
})

describe('#644 — validarPlanPago', () => {
  it.each([
    [{ frecuenciaPago: null, diasPago: [] }, null],
    [{ frecuenciaPago: 'QUINCENAL', diasPago: [] }, null],
    [{ frecuenciaPago: 'SEMANAL', diasPago: [6] }, null],
    [{ frecuenciaPago: 'MENSUAL', diasPago: [15] }, null],
    [{ frecuenciaPago: 'FECHAS', diasPago: [5, 20] }, null],
  ] as const)('válido %j', (plan, esperado) => expect(validarPlanPago({ frecuenciaPago: plan.frecuenciaPago, diasPago: [...plan.diasPago] })).toBe(esperado))
  it.each([
    [{ frecuenciaPago: 'SEMANAL', diasPago: [7] }],
    [{ frecuenciaPago: 'SEMANAL', diasPago: [] }],
    [{ frecuenciaPago: 'MENSUAL', diasPago: [1, 2] }],
    [{ frecuenciaPago: 'FECHAS', diasPago: [0] }],
    [{ frecuenciaPago: 'FECHAS', diasPago: [32] }],
    [{ frecuenciaPago: null, diasPago: [5] }],
  ] as const)('inválido %j', (plan) => expect(validarPlanPago({ frecuenciaPago: plan.frecuenciaPago, diasPago: [...plan.diasPago] })).not.toBeNull())
})
