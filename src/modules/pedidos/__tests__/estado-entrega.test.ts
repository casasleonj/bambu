// @tests EstadoEntregaVO — transiciones permitidas y bloqueadas
import { describe, it, expect } from 'vitest'
import { EstadoEntregaVO } from '../domain/value-objects/EstadoEntrega'

describe('EstadoEntregaVO.transiciones', () => {
  it('PENDIENTE puede ir a EN_RUTA', () => {
    const vo = EstadoEntregaVO.create('PENDIENTE')
    expect(vo.canTransitionTo(EstadoEntregaVO.create('EN_RUTA'))).toBe(true)
  })

  it('PENDIENTE puede ir a CANCELADO', () => {
    const vo = EstadoEntregaVO.create('PENDIENTE')
    expect(vo.canTransitionTo(EstadoEntregaVO.create('CANCELADO'))).toBe(true)
  })

  it('PENDIENTE NO puede ir directamente a ENTREGADO', () => {
    const vo = EstadoEntregaVO.create('PENDIENTE')
    expect(vo.canTransitionTo(EstadoEntregaVO.create('ENTREGADO'))).toBe(false)
  })

  it('EN_RUTA puede ir a ENTREGADO', () => {
    const vo = EstadoEntregaVO.create('EN_RUTA')
    expect(vo.canTransitionTo(EstadoEntregaVO.create('ENTREGADO'))).toBe(true)
  })

  it('ENTREGADO puede ir a ANULADO (única transición desde ENTREGADO)', () => {
    const vo = EstadoEntregaVO.create('ENTREGADO')
    expect(vo.canTransitionTo(EstadoEntregaVO.create('ANULADO'))).toBe(true)
    expect(vo.canTransitionTo(EstadoEntregaVO.create('CANCELADO'))).toBe(false)
    expect(vo.canTransitionTo(EstadoEntregaVO.create('EN_RUTA'))).toBe(false)
  })

  it('CANCELADO es terminal — no transiciones permitidas', () => {
    const vo = EstadoEntregaVO.create('CANCELADO')
    expect(vo.canTransitionTo(EstadoEntregaVO.create('PENDIENTE'))).toBe(false)
    expect(vo.canTransitionTo(EstadoEntregaVO.create('ENTREGADO'))).toBe(false)
  })

  it('ANULADO es terminal — no transiciones permitidas', () => {
    const vo = EstadoEntregaVO.create('ANULADO')
    expect(vo.canTransitionTo(EstadoEntregaVO.create('PENDIENTE'))).toBe(false)
    expect(vo.canTransitionTo(EstadoEntregaVO.create('ENTREGADO'))).toBe(false)
  })
})

describe('EstadoEntregaVO.isTerminal', () => {
  it('CANCELADO es terminal', () => {
    expect(EstadoEntregaVO.create('CANCELADO').isTerminal()).toBe(true)
  })
  it('ANULADO es terminal', () => {
    expect(EstadoEntregaVO.create('ANULADO').isTerminal()).toBe(true)
  })
  it('ENTREGADO NO es terminal (puede anularse)', () => {
    expect(EstadoEntregaVO.create('ENTREGADO').isTerminal()).toBe(false)
  })
})

describe('EstadoEntregaVO.from (parsing)', () => {
  it('parsea string válido', () => {
    expect(EstadoEntregaVO.from('PENDIENTE').get()).toBe('PENDIENTE')
  })
  it('lanza error con string inválido', () => {
    expect(() => EstadoEntregaVO.from('XYZ' as any)).toThrow(/inválido/)
  })
})
