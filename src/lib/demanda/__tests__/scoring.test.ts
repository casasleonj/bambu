// @tests scoring — Bloque 3

import { describe, it, expect } from 'vitest'
import { calcularScoreLlamada, debeMostrarEnLlamadas } from '../scoring'

describe('calcularScoreLlamada', () => {
  it('diasAtraso <= 0 → score 0', () => {
    expect(calcularScoreLlamada({ diasAtraso: 0 })).toBe(0)
    expect(calcularScoreLlamada({ diasAtraso: -5 })).toBe(0)
  })

  it('score básico = diasAtraso * pesoAtraso', () => {
    expect(calcularScoreLlamada({ diasAtraso: 5, valorTipico: 0 })).toBe(5)
    expect(calcularScoreLlamada({ diasAtraso: 10, valorTipico: 0, pesoAtraso: 2 })).toBe(20)
  })

  it('valor monetario suma al score (normalizado por VALOR_REFERENCIA)', () => {
    // valor = 50K (igual a VALOR_REFERENCIA) → suma 0.5 con pesoValor default
    const s = calcularScoreLlamada({ diasAtraso: 5, valorTipico: 50000 })
    // 5*1.0 + (50000/50000)*0.5 = 5.5
    expect(s).toBe(5.5)
  })

  it('valor = 100K suma 1.0 al score', () => {
    const s = calcularScoreLlamada({ diasAtraso: 5, valorTipico: 100000 })
    // 5*1.0 + (100000/50000)*0.5 = 5 + 1 = 6
    expect(s).toBe(6)
  })
})

describe('debeMostrarEnLlamadas', () => {
  it('oculta si diasAtraso <= 0', () => {
    expect(debeMostrarEnLlamadas({ diasAtraso: 0, score: 0 })).toBe(false)
    expect(debeMostrarEnLlamadas({ diasAtraso: -1, score: 0 })).toBe(false)
  })

  it('muestra si score >= umbral', () => {
    expect(debeMostrarEnLlamadas({ diasAtraso: 3, score: 3, umbralMin: 2 })).toBe(true)
    expect(debeMostrarEnLlamadas({ diasAtraso: 1, score: 1, umbralMin: 2 })).toBe(false)
  })
})
