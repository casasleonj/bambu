// @tests G5.1 — EstadoPagoVO.proyectar (ADR-PEDIDO-ESTADO-CANONICO-001 §2)
import { describe, it, expect } from 'vitest'
import { EstadoPagoVO } from '../EstadoPago'

const proyectar = (t: number, p: number, e: string) => EstadoPagoVO.proyectar(t, p, e).get()

describe('EstadoPagoVO.proyectar — semántica de ANTICIPADO', () => {
  it('pagado completo + entrega aún no ocurrida → ANTICIPADO', () => {
    expect(proyectar(1000, 1000, 'PENDIENTE')).toBe('ANTICIPADO')
    expect(proyectar(1000, 1200, 'EN_RUTA')).toBe('ANTICIPADO')
    expect(proyectar(1000, 1000, 'NO_ENTREGADO')).toBe('ANTICIPADO')
  })

  it('pagado completo + ya entregado → PAGADO', () => {
    expect(proyectar(1000, 1000, 'ENTREGADO')).toBe('PAGADO')
  })

  it('cancelado / anulado → ANULADO (sin importar pago)', () => {
    expect(proyectar(1000, 1000, 'CANCELADO')).toBe('ANULADO')
    expect(proyectar(1000, 0, 'ANULADO')).toBe('ANULADO')
  })

  it('pago parcial → PARCIAL; sin pago → PENDIENTE', () => {
    expect(proyectar(1000, 400, 'PENDIENTE')).toBe('PARCIAL')
    expect(proyectar(1000, 400, 'ENTREGADO')).toBe('PARCIAL')
    expect(proyectar(1000, 0, 'PENDIENTE')).toBe('PENDIENTE')
  })

  it('nunca produce VENCIDO (es override del cron)', () => {
    for (const e of ['PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'NO_ENTREGADO', 'CANCELADO', 'ANULADO']) {
      expect(proyectar(1000, 500, e)).not.toBe('VENCIDO')
    }
  })
})

describe('EstadoPagoVO.fromTotals — compat (asume ENTREGADO)', () => {
  it('pagado completo → PAGADO (nunca ANTICIPADO)', () => {
    expect(EstadoPagoVO.fromTotals(1000, 1000).get()).toBe('PAGADO')
    expect(EstadoPagoVO.fromTotals(1000, 500).get()).toBe('PARCIAL')
    expect(EstadoPagoVO.fromTotals(1000, 0).get()).toBe('PENDIENTE')
  })
})
