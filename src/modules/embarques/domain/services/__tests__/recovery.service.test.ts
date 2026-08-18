// @tests FASE 4 — recovery (validación de dominio pura)
// ADR-RECUPERACION-001, contrato §3/§4.

import { describe, it, expect } from 'vitest'
import { validarRecoveryDecision } from '../recovery.service'

describe('validarRecoveryDecision — contrato §3/§4', () => {
  it('rechaza tipo inválido', () => {
    expect(validarRecoveryDecision({ tipo: 'OTRO' as 'SOBRANTE', cantidad: 5, cantidadAplicada: 2 }))
      .toContain('tipo debe ser SOBRANTE o FALTANTE')
  })

  it('rechaza cantidadAplicada > cantidad', () => {
    expect(validarRecoveryDecision({ tipo: 'SOBRANTE', cantidad: 3, cantidadAplicada: 4, sourceEventId: 'evt-1' }))
      .toContain('cantidadAplicada no puede exceder cantidad')
  })

  it('acepta cantidadAplicada == cantidad', () => {
    expect(validarRecoveryDecision({ tipo: 'SOBRANTE', cantidad: 3, cantidadAplicada: 3, sourceEventId: 'evt-1' }))
      .toEqual([])
  })

  it('SOBRANTE exige sourceEventId', () => {
    expect(validarRecoveryDecision({ tipo: 'SOBRANTE', cantidad: 3, cantidadAplicada: 2 }))
      .toContain('SOBRANTE exige sourceEventId')
  })

  it('FALTANTE no debe tener sourceEventId (no inventar evento físico)', () => {
    expect(validarRecoveryDecision({ tipo: 'FALTANTE', cantidad: 3, cantidadAplicada: 2, sourceEventId: 'evt-1' }))
      .toContain('FALTANTE no debe tener sourceEventId')
  })

  it('FALTANTE sin sourceEventId es válido', () => {
    expect(validarRecoveryDecision({ tipo: 'FALTANTE', cantidad: 3, cantidadAplicada: 2, sourceEventId: null }))
      .toEqual([])
  })
})
