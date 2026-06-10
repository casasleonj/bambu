/**
 * Tests for the client-side config fetcher.
 *
 * Critical regression target: F2 — the response shape is { success, config: {...} }
 * because apiSuccess() spreads the data to the top level. A previous version of
 * the code read json.data.valor, which was always undefined, causing the
 * REQUIERE_FOTO_ENTREGA toggle to silently fail in the UI.
 */
import { describe, it, expect, vi } from 'vitest'
import { fetchRequiereFotoEntrega, parseRequiereFotoValue } from '@/lib/client/config-client'

describe('parseRequiereFotoValue', () => {
  it.each([
    ['true', true],
    ['TRUE', true],
    ['True', true],
    ['1', true],
    ['si', true],
    ['sí', true],
    ['yes', true],
    ['y', true],
    ['false', false],
    ['0', false],
    ['no', false],
    ['', false],
    ['random', false],
  ])('parses %s → %s', (input, expected) => {
    expect(parseRequiereFotoValue(input)).toBe(expected)
  })

  it('handles null and undefined', () => {
    expect(parseRequiereFotoValue(null)).toBe(false)
    expect(parseRequiereFotoValue(undefined)).toBe(false)
  })

  it('trims whitespace', () => {
    expect(parseRequiereFotoValue('  true  ')).toBe(true)
  })
})

describe('fetchRequiereFotoEntrega — response shape (F2 regression)', () => {
  it('reads valor from json.config (correct top-level path)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, config: { clave: 'REQUIERE_FOTO_ENTREGA', valor: 'true' } }),
    })
    const result = await fetchRequiereFotoEntrega({ fetchImpl: mockFetch as unknown as typeof fetch })
    expect(result).toBe(true)
  })

  it('returns false when valor is "false"', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, config: { clave: 'REQUIERE_FOTO_ENTREGA', valor: 'false' } }),
    })
    const result = await fetchRequiereFotoEntrega({ fetchImpl: mockFetch as unknown as typeof fetch })
    expect(result).toBe(false)
  })

  it('returns false when response is 404 (config not seeded yet)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    const result = await fetchRequiereFotoEntrega({ fetchImpl: mockFetch as unknown as typeof fetch })
    expect(result).toBe(false)
  })

  it('returns false on network error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const result = await fetchRequiereFotoEntrega({ fetchImpl: mockFetch as unknown as typeof fetch })
    expect(result).toBe(false)
  })

  it('falls back to json.data.valor if json.config is missing (legacy)', async () => {
    // Defensive: if some future endpoint changes shape, we still try json.data.
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { valor: 'true' } }),
    })
    const result = await fetchRequiereFotoEntrega({ fetchImpl: mockFetch as unknown as typeof fetch })
    expect(result).toBe(true)
  })

  it('returns false when response is malformed JSON', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('invalid JSON')
      },
    })
    const result = await fetchRequiereFotoEntrega({ fetchImpl: mockFetch as unknown as typeof fetch })
    expect(result).toBe(false)
  })

  it('hits the right URL by default', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false })
    await fetchRequiereFotoEntrega({ fetchImpl: mockFetch as unknown as typeof fetch })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/config?clave=REQUIERE_FOTO_ENTREGA',
      expect.objectContaining({ cache: 'no-store' }),
    )
  })
})
