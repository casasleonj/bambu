import { describe, it, expect } from 'vitest'
import { clasificarCompromiso, compromisoVencido } from '@/lib/pedidos-compromiso'

const hoy = '2026-11-17'
const base = { estadoEntrega: 'PENDIENTE' }

describe('clasificarCompromiso (#836, A01–A03, A23, A27)', () => {
  it('hoy / arrastrado / programado / sin_fecha por día de Bogotá', () => {
    expect(clasificarCompromiso({ ...base, fechaEntrega: new Date('2026-11-17T15:00:00-05:00') }, hoy)).toBe('hoy')
    expect(clasificarCompromiso({ ...base, fechaEntrega: new Date('2026-11-16T10:00:00-05:00') }, hoy)).toBe('arrastrado')
    expect(clasificarCompromiso({ ...base, fechaEntrega: new Date('2026-11-19T10:00:00-05:00') }, hoy)).toBe('programado')
    expect(clasificarCompromiso({ ...base, fechaEntrega: null }, hoy)).toBe('sin_fecha')
  })
  it('A27: 22:00 en Bogotá (03:00 UTC del día siguiente) sigue siendo el día de Bogotá', () => {
    expect(clasificarCompromiso({ ...base, fechaEntrega: new Date('2026-11-18T03:00:00Z') }, hoy)).toBe('hoy')
    expect(clasificarCompromiso({ ...base, fechaEntrega: new Date('2026-11-17T04:59:00Z') }, hoy)).toBe('arrastrado')
  })
  it('A23: cerrado/cancelado/anulado nunca es demanda pendiente', () => {
    for (const e of ['ENTREGADO', 'CANCELADO', 'ANULADO'])
      expect(clasificarCompromiso({ estadoEntrega: e, fechaEntrega: new Date('2026-11-10T12:00:00Z') }, hoy)).toBe('cerrado')
  })
  it('compromisoVencido compara por día de Bogotá', () => {
    expect(compromisoVencido(null, new Date())).toBe(false)
    expect(compromisoVencido(new Date('2026-11-16T12:00:00-05:00'), new Date('2026-11-17T08:00:00-05:00'))).toBe(true)
    expect(compromisoVencido(new Date('2026-11-17T23:00:00-05:00'), new Date('2026-11-17T08:00:00-05:00'))).toBe(false)
  })
})
