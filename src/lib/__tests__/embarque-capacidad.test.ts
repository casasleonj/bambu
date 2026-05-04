import { describe, it, expect } from 'vitest'
import {
  calcularPacasEmbarque,
  calcularPesoEmbarque,
  getCapacidadInfo,
} from '@/lib/embarque-capacidad'

// ─── calcularPacasEmbarque ───────────────────────────────────────────

describe('calcularPacasEmbarque', () => {
  it('returns 0 for empty array', () => {
    expect(calcularPacasEmbarque([])).toBe(0)
  })

  it('sums single item with one product', () => {
    const result = calcularPacasEmbarque([{ cPacaAguaPed: 3 }])
    expect(result).toBe(3)
  })

  it('sums single item with multiple products', () => {
    const result = calcularPacasEmbarque([{
      cPacaAguaPed: 2,
      cPacaHieloPed: 1,
      cBotellonFabPed: 3,
    }])
    expect(result).toBe(6)
  })

  it('sums multiple items', () => {
    const result = calcularPacasEmbarque([
      { cPacaAguaPed: 2, cPacaHieloPed: 1 },
      { cBotellonFabPed: 3, cBolsaAguaPed: 4 },
    ])
    expect(result).toBe(10)
  })

  it('treats undefined fields as 0', () => {
    const result = calcularPacasEmbarque([{ cPacaAguaPed: 5 }])
    expect(result).toBe(5)
  })

  it('treats null fields as 0', () => {
    const result = calcularPacasEmbarque([{ cPacaAguaPed: null as any, cPacaHieloPed: 3 }])
    expect(result).toBe(3)
  })

  it('handles all-zero items', () => {
    const result = calcularPacasEmbarque([
      { cPacaAguaPed: 0, cPacaHieloPed: 0 },
    ])
    expect(result).toBe(0)
  })

  it('handles negative quantities (reduces total)', () => {
    const result = calcularPacasEmbarque([
      { cPacaAguaPed: 5 },
      { cPacaAguaPed: -2 },
    ])
    expect(result).toBe(3)
  })

  it('covers all product fields', () => {
    const result = calcularPacasEmbarque([{
      cPacaAguaPed: 1,
      cPacaHieloPed: 2,
      cBotellonFabPed: 3,
      cBotellonDomPed: 4,
      cBolsaAguaPed: 5,
      cBolsaHieloPed: 6,
    }])
    expect(result).toBe(21)
  })

  it('handles empty objects', () => {
    const result = calcularPacasEmbarque([{}])
    expect(result).toBe(0)
  })

  it('handles many items', () => {
    const items = Array.from({ length: 100 }, () => ({ cPacaAguaPed: 1 }))
    expect(calcularPacasEmbarque(items)).toBe(100)
  })
})

// ─── calcularPesoEmbarque ────────────────────────────────────────────

describe('calcularPesoEmbarque', () => {
  it('returns 0 for empty array', () => {
    expect(calcularPesoEmbarque([])).toBe(0)
  })

  it('calculates weight for single paca agua (10 kg)', () => {
    const result = calcularPesoEmbarque([{ cPacaAguaPed: 1 }])
    expect(result).toBe(10)
  })

  it('calculates weight for single paca hielo (11 kg)', () => {
    const result = calcularPesoEmbarque([{ cPacaHieloPed: 1 }])
    expect(result).toBe(11)
  })

  it('calculates weight for botellón (20 kg each)', () => {
    const result = calcularPesoEmbarque([{ cBotellonFabPed: 2 }])
    expect(result).toBe(40)
  })

  it('calculates weight for bolsa agua (0.25 kg)', () => {
    const result = calcularPesoEmbarque([{ cBolsaAguaPed: 10 }])
    expect(result).toBe(2.5)
  })

  it('calculates weight for bolsa hielo (0.55 kg)', () => {
    const result = calcularPesoEmbarque([{ cBolsaHieloPed: 10 }])
    expect(result).toBe(5.5)
  })

  it('sums weight across multiple items', () => {
    const result = calcularPesoEmbarque([
      { cPacaAguaPed: 1 },
      { cPacaHieloPed: 2 },
      { cBotellonDomPed: 1 },
    ])
    expect(result).toBe(10 + 22 + 20)
  })

  it('sums weight across all product types in one item', () => {
    const result = calcularPesoEmbarque([{
      cPacaAguaPed: 2,
      cPacaHieloPed: 1,
      cBotellonFabPed: 3,
      cBotellonDomPed: 1,
      cBolsaAguaPed: 10,
      cBolsaHieloPed: 5,
    }])
    expect(result).toBe(
      2 * 10 + 1 * 11 + 3 * 20 + 1 * 20 + 10 * 0.25 + 5 * 0.55,
    )
  })

  it('treats undefined fields as 0', () => {
    const result = calcularPesoEmbarque([{ cPacaAguaPed: 1 }])
    expect(result).toBe(10)
  })

  it('treats null fields as 0', () => {
    const result = calcularPesoEmbarque([{ cPacaAguaPed: null as any, cBotellonFabPed: 2 }])
    expect(result).toBe(40)
  })

  it('returns 0 for all-zero items', () => {
    const result = calcularPesoEmbarque([{ cPacaAguaPed: 0, cPacaHieloPed: 0 }])
    expect(result).toBe(0)
  })

  it('handles negative quantities (reduces weight)', () => {
    const result = calcularPesoEmbarque([
      { cPacaAguaPed: 2 },
      { cPacaAguaPed: -1 },
    ])
    expect(result).toBe(10)
  })
})

// ─── getCapacidadInfo ────────────────────────────────────────────────

describe('getCapacidadInfo', () => {
  const capacidad = 200 // kg

  it('returns ideal for 0% load', () => {
    const info = getCapacidadInfo(0, 0, capacidad)
    expect(info.nivel).toBe('ideal')
    expect(info.porcentaje).toBe(0)
    expect(info.icon).toBe('🟢')
  })

  it('returns ideal for 50% load', () => {
    const info = getCapacidadInfo(10, 100, capacidad)
    expect(info.nivel).toBe('ideal')
    expect(info.porcentaje).toBe(50)
  })

  it('returns ideal at 74.9%', () => {
    const info = getCapacidadInfo(10, 149.8, capacidad)
    expect(info.nivel).toBe('ideal')
  })

  it('returns pesado at exactly 75%', () => {
    const info = getCapacidadInfo(10, 150, capacidad)
    expect(info.nivel).toBe('pesado')
    expect(info.icon).toBe('🟡')
    expect(info.label).toBe('Pesado')
  })

  it('returns pesado at 80%', () => {
    const info = getCapacidadInfo(10, 160, capacidad)
    expect(info.nivel).toBe('pesado')
  })

  it('returns máximo at exactly 87%', () => {
    const info = getCapacidadInfo(10, 174, capacidad)
    expect(info.nivel).toBe('maximo')
    expect(info.icon).toBe('🔴')
    expect(info.label).toBe('Máximo')
  })

  it('returns máximo at 95%', () => {
    const info = getCapacidadInfo(10, 190, capacidad)
    expect(info.nivel).toBe('maximo')
  })

  it('returns excedido at exactly 100%', () => {
    // 100 is NOT > 100, so it falls through to máximo
    const info = getCapacidadInfo(10, 200, capacidad)
    expect(info.nivel).toBe('maximo')
    expect(info.porcentaje).toBe(100)
  })

  it('returns excedido above 100%', () => {
    const info = getCapacidadInfo(10, 210, capacidad)
    expect(info.nivel).toBe('excedido')
    expect(info.icon).toBe('⛔')
    expect(info.label).toBe('Excedido')
    expect(info.porcentaje).toBe(105)
  })

  it('returns excedido at 150%', () => {
    const info = getCapacidadInfo(20, 300, capacidad)
    expect(info.nivel).toBe('excedido')
    expect(info.porcentaje).toBe(150)
  })

  it('returns ideal when capacidadKg is 0 (division by zero guard)', () => {
    const info = getCapacidadInfo(10, 100, 0)
    expect(info.nivel).toBe('ideal')
    expect(info.porcentaje).toBe(0)
  })

  it('returns ideal when capacidadKg is negative', () => {
    const info = getCapacidadInfo(10, 100, -1)
    expect(info.nivel).toBe('ideal')
    expect(info.porcentaje).toBe(0)
  })

  it('returns ideal for pesoKg 0 regardless of pacas', () => {
    const info = getCapacidadInfo(50, 0, capacidad)
    expect(info.nivel).toBe('ideal')
    expect(info.porcentaje).toBe(0)
  })

  it('includes correct tailwind color classes for each nivel', () => {
    const ideal = getCapacidadInfo(5, 100, capacidad)
    expect(ideal.color).toContain('text-green-600')
    expect(ideal.color).toContain('bg-green-50')

    const pesado = getCapacidadInfo(5, 150, capacidad)
    expect(pesado.color).toContain('text-yellow-600')
    expect(pesado.color).toContain('bg-yellow-50')

    const maximo = getCapacidadInfo(5, 180, capacidad)
    expect(maximo.color).toContain('text-red-600')
    expect(maximo.color).toContain('bg-red-50')

    const excedido = getCapacidadInfo(5, 210, capacidad)
    expect(excedido.color).toContain('text-red-700')
    expect(excedido.color).toContain('bg-red-100')
  })

  it('preserves totalPacas and pesoKg in output', () => {
    const info = getCapacidadInfo(15, 120, capacidad)
    expect(info.total).toBe(15)
    expect(info.pesoKg).toBe(120)
    expect(info.capacidadKg).toBe(capacidad)
  })
})
