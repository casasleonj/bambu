// @tests G6 (ADR-PEDIDO-ORIGEN-CANAL-001) — helpers de canal
import { describe, it, expect } from 'vitest'
import { tipoDesdeCanal, canalDesdeTipo, normalizeCanalFilter } from '@/lib/pedido-canal'

describe('tipoDesdeCanal', () => {
  it('PUNTO → PUNTO, DOMICILIO → ENVIO', () => {
    expect(tipoDesdeCanal('PUNTO')).toBe('PUNTO')
    expect(tipoDesdeCanal('DOMICILIO')).toBe('ENVIO')
    expect(tipoDesdeCanal('cualquier-cosa')).toBe('ENVIO')
  })
})

describe('canalDesdeTipo', () => {
  it('PUNTO → PUNTO, ENVIO → DOMICILIO', () => {
    expect(canalDesdeTipo('PUNTO')).toBe('PUNTO')
    expect(canalDesdeTipo('ENVIO')).toBe('DOMICILIO')
  })
})

describe('normalizeCanalFilter', () => {
  it('acepta canal canónico', () => {
    expect(normalizeCanalFilter(['PUNTO'])).toEqual(['PUNTO'])
    expect(normalizeCanalFilter(['DOMICILIO'])).toEqual(['DOMICILIO'])
  })

  it('normaliza el legacy `tipo` (ENVIO → DOMICILIO)', () => {
    expect(normalizeCanalFilter(['ENVIO'])).toEqual(['DOMICILIO'])
  })

  it('deduplica canal + tipo equivalentes', () => {
    expect(normalizeCanalFilter(['DOMICILIO', 'ENVIO'])).toEqual(['DOMICILIO'])
    expect(normalizeCanalFilter(['PUNTO', 'PUNTO'])).toEqual(['PUNTO'])
  })

  it('ambos canales', () => {
    expect(normalizeCanalFilter(['PUNTO', 'ENVIO']).sort()).toEqual(['DOMICILIO', 'PUNTO'])
  })

  it('ignora valores desconocidos y vacío', () => {
    expect(normalizeCanalFilter([])).toEqual([])
    expect(normalizeCanalFilter(['XYZ', ''])).toEqual([])
  })
})
