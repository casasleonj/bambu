// @tests expand-short-maps-url — Bloque 6 (links cortos)
// Cubre: allowlist SSRF, cadena de redirects (HEAD→GET), tope de redirects,
// hosts no permitidos, y fallo de red.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  expandShortMapsUrl,
  isAllowedMapsHost,
} from '../expand-short-maps-url'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function redirectResponse(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } })
}

describe('isAllowedMapsHost', () => {
  it('permite hosts de Google Maps', () => {
    expect(isAllowedMapsHost('https://maps.app.goo.gl/x')).toBe(true)
    expect(isAllowedMapsHost('https://goo.gl/maps/x')).toBe(true)
    expect(isAllowedMapsHost('https://www.google.com/maps')).toBe(true)
    expect(isAllowedMapsHost('https://maps.google.com/')).toBe(true)
  })

  it('bloquea hosts arbitrarios (SSRF)', () => {
    expect(isAllowedMapsHost('https://evil.com/x')).toBe(false)
    expect(isAllowedMapsHost('https://google.com.evil.com/')).toBe(false)
    expect(isAllowedMapsHost('not-a-url')).toBe(false)
  })
})

describe('expandShortMapsUrl', () => {
  it('rechaza host no permitido sin tocar la red', async () => {
    const r = await expandShortMapsUrl('https://evil.com/x')
    expect(r).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('devuelve la URL si la respuesta no es redirect (200)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))
    const r = await expandShortMapsUrl('https://goo.gl/maps/x')
    expect(r).toBe('https://goo.gl/maps/x')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('goo.gl'),
      expect.objectContaining({ method: 'HEAD', redirect: 'manual' }),
    )
  })

  it('sigue la cadena de redirects hasta la URL final', async () => {
    fetchMock
      .mockResolvedValueOnce(redirectResponse('https://www.google.com/maps/place/X'))
      .mockResolvedValueOnce(
        redirectResponse('https://maps.google.com/?q=4.65,-74.05'),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    const r = await expandShortMapsUrl('https://maps.app.goo.gl/short')
    expect(r).toBe('https://maps.google.com/?q=4.65,-74.05')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('cae a GET si HEAD falla (red) y devuelve la URL', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('network down')) // HEAD
      .mockResolvedValueOnce(new Response(null, { status: 200 })) // GET
    const r = await expandShortMapsUrl('https://goo.gl/maps/x')
    expect(r).toBe('https://goo.gl/maps/x')
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('null si un redirect apunta a host no permitido', async () => {
    fetchMock.mockResolvedValueOnce(redirectResponse('https://evil.com/x'))
    const r = await expandShortMapsUrl('https://goo.gl/maps/x')
    expect(r).toBeNull()
  })

  it('null si excede el tope de redirects', async () => {
    // 5 redirects seguidos sin llegar a 200 → null
    for (let i = 0; i < 6; i++) {
      fetchMock.mockResolvedValueOnce(redirectResponse('https://goo.gl/maps/next'))
    }
    const r = await expandShortMapsUrl('https://goo.gl/maps/x')
    expect(r).toBeNull()
  })

  it('null si un redirect 3xx no trae location', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302 }))
    const r = await expandShortMapsUrl('https://goo.gl/maps/x')
    expect(r).toBeNull()
  })

  it('null ante error de red en todos los intentos', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'))
    const r = await expandShortMapsUrl('https://goo.gl/maps/x')
    expect(r).toBeNull()
  })
})
