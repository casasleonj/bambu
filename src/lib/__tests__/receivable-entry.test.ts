// @tests FASE 5 — receivable-entry (detector de divergencia, puro)
// ADR-MONETARIO-001, contrato §12.

import { describe, it, expect } from 'vitest'
import { detectarDivergencia } from '@/lib/receivable-entry'

describe('detectarDivergencia — contrato §12', () => {
  it('no detecta divergencia cuando proyección == canónico', () => {
    expect(detectarDivergencia(15000, 15000)).toEqual({
      divergencia: false,
      diferencia: 0,
    })
  })

  it('no detecta divergencia dentro del umbral', () => {
    const d = detectarDivergencia(15000, 15000.005, 0.01)
    expect(d.divergencia).toBe(false)
  })

  it('detecta divergencia cuando supera el umbral', () => {
    const d = detectarDivergencia(15000, 14000)
    expect(d.divergencia).toBe(true)
    expect(d.diferencia).toBe(1000)
  })
})
