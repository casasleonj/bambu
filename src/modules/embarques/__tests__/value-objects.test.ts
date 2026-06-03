// @tests EmbarqueId — rechazar string vacío
// Hallazgo: F4.5 — el constructor permite string vacío como "placeholder"
import { describe, it, expect } from 'vitest'
import { EmbarqueId } from '../domain/value-objects/EmbarqueId'

describe('EmbarqueId', () => {
  it('acepta ID válido', () => {
    const id = EmbarqueId.from('valid-cuid-123')
    expect(id.value).toBe('valid-cuid-123')
  })

  // Después del fix F4.5: este test debe pasar
  it('rechaza string vacío (regresión)', () => {
    expect(() => EmbarqueId.from('')).toThrow()
  })

  it('rechaza solo espacios', () => {
    expect(() => EmbarqueId.from('   ')).toThrow()
  })

  it('empty() retorna placeholder explícito (no usar from)', () => {
    const id = EmbarqueId.empty()
    expect(id).toBeDefined()
  })

  it('dos IDs con mismo valor son iguales', () => {
    const a = EmbarqueId.from('abc-123')
    const b = EmbarqueId.from('abc-123')
    expect(a.equals(b)).toBe(true)
  })
})
