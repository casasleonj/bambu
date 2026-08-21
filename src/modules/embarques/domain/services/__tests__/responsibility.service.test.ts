// @tests validarContextoResponsibilityCase — FASE 6, contrato §13
// Un ResponsibilityCase puede investigarse sin embarque activo (ej. fiado
// vencido), pero exige al menos una referencia de contexto localizable.

import { describe, it, expect } from 'vitest'
import { validarContextoResponsibilityCase } from '../responsibility.service'

describe('validarContextoResponsibilityCase', () => {
  it('acepta solo embarqueId', () => {
    expect(validarContextoResponsibilityCase({ embarqueId: 'emb_1' })).toEqual([])
  })

  it('acepta solo clienteId (sin embarque activo)', () => {
    expect(validarContextoResponsibilityCase({ clienteId: 'cli_1' })).toEqual([])
  })

  it('acepta solo trabajadorId', () => {
    expect(validarContextoResponsibilityCase({ trabajadorId: 'trab_1' })).toEqual([])
  })

  it('acepta combinaciones de varias referencias', () => {
    expect(
      validarContextoResponsibilityCase({ embarqueId: 'emb_1', trabajadorId: 'trab_1' }),
    ).toEqual([])
  })

  it('rechaza cuando no hay ninguna referencia de contexto', () => {
    const errores = validarContextoResponsibilityCase({})
    expect(errores).toHaveLength(1)
    expect(errores[0]).toMatch(/CONTEXTO_REQUERIDO/)
  })

  it('rechaza cuando todas las referencias son null', () => {
    const errores = validarContextoResponsibilityCase({
      embarqueId: null,
      clienteId: null,
      trabajadorId: null,
    })
    expect(errores).toHaveLength(1)
  })
})
