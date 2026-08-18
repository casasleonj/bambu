// @tests FASE 8 — promociones/regalos (validación pura)
// ADR-PROMOCION-001 / ADR-AUTORIZACION-REGALOS-001, contrato §17.

import { describe, it, expect } from 'vitest'
import { validarPromocion } from '../promocion.service'

describe('validarPromocion — contrato §17', () => {
  it('rechaza sin autorizadoPorId (autorización auditable obligatoria)', () => {
    expect(validarPromocion({ producto: 'PACA_AGUA', cantidad: 1 }))
      .toContain('promocion exige autorizadoPorId (autorización auditable)')
  })

  it('rechaza cantidad no positiva', () => {
    expect(validarPromocion({ producto: 'PACA_AGUA', cantidad: 0, autorizadoPorId: 'u1' }))
      .toContain('cantidad debe ser un entero positivo')
  })

  it('acepta promoción autorizada con cantidad positiva', () => {
    expect(validarPromocion({ producto: 'PACA_AGUA', cantidad: 2, autorizadoPorId: 'u1' }))
      .toEqual([])
  })
})
