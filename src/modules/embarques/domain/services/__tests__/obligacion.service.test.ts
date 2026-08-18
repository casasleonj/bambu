// @tests FASE 3 — obligaciones (validación de dominio pura)
// ADR-OBLIGACION-001, contrato §7.

import { describe, it, expect } from 'vitest'
import { calcularDisponible, validarAsignacion, validarCumplimiento } from '../obligacion.service'

describe('calcularDisponible', () => {
  it('deriva disponible = original - cumplida - asignada', () => {
    expect(calcularDisponible(10, 3, 2)).toBe(5)
  })
})

describe('validarAsignacion — invariante cumplida+asignada <= original', () => {
  it('rechaza cantidad no positiva', () => {
    expect(validarAsignacion({ cantidadOriginal: 10, cantidadCumplida: 0, cantidadAsignada: 0, cantidadNueva: 0 }))
      .toContain('cantidad a asignar debe ser un entero positivo')
  })

  it('rechaza sobreconsumo', () => {
    expect(validarAsignacion({ cantidadOriginal: 10, cantidadCumplida: 3, cantidadAsignada: 2, cantidadNueva: 6 }))
      .toContain('SOBRECONSUMO: cantidad excede el disponible de la obligación')
  })

  it('acepta asignación dentro del disponible', () => {
    expect(validarAsignacion({ cantidadOriginal: 10, cantidadCumplida: 3, cantidadAsignada: 2, cantidadNueva: 5 }))
      .toEqual([])
  })

  it('acepta asignación exacta del disponible', () => {
    expect(validarAsignacion({ cantidadOriginal: 10, cantidadCumplida: 5, cantidadAsignada: 0, cantidadNueva: 5 }))
      .toEqual([])
  })
})

describe('validarCumplimiento', () => {
  it('rechaza cumplir más de lo asignado', () => {
    expect(validarCumplimiento({ cantidadOriginal: 10, cantidadCumplida: 0, cantidadAsignada: 3, cantidadACumplir: 5 }))
      .toContain('NO_SE_PUEDE_CUMPLIR_MAS_DE_LO_ASIGNADO')
  })

  it('acepta cumplimiento dentro de lo asignado', () => {
    expect(validarCumplimiento({ cantidadOriginal: 10, cantidadCumplida: 0, cantidadAsignada: 3, cantidadACumplir: 3 }))
      .toEqual([])
  })
})
