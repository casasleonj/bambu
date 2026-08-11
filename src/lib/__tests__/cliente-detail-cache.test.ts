import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  loadClienteDetail,
  fetchClienteDetailFresh,
  warmClienteDetail,
  __resetClienteDetailCache,
} from '../cliente-detail-cache'

const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status })
}

describe('cliente-detail-cache', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    __resetClienteDetailCache()
  })

  afterEach(() => {
    __resetClienteDetailCache()
  })

  it('loadClienteDetail devuelve {ok:true, cliente} en éxito y cachea el resultado', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { success: true, cliente: { id: 'c1', nombre: 'Ana' } }))

    const result = await loadClienteDetail<{ id: string; nombre: string }>('c1')
    expect(result).toEqual({ ok: true, cliente: { id: 'c1', nombre: 'Ana' } })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith('/api/clientes/c1', expect.anything())
  })

  it('una segunda llamada dentro del TTL usa el caché, sin volver a llamar a fetch', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { success: true, cliente: { id: 'c1', nombre: 'Ana' } }))

    await loadClienteDetail('c1')
    const second = await loadClienteDetail<{ id: string; nombre: string }>('c1')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(second).toEqual({ ok: true, cliente: { id: 'c1', nombre: 'Ana' } })
  })

  it('dedupe: llamadas concurrentes para el mismo id comparten una sola promesa/fetch', async () => {
    let resolveFetch: (value: Response) => void = () => {}
    mockFetch.mockReturnValueOnce(
      new Promise<Response>(resolve => {
        resolveFetch = resolve
      })
    )

    const p1 = loadClienteDetail('c1')
    const p2 = loadClienteDetail('c1')
    resolveFetch(jsonResponse(200, { success: true, cliente: { id: 'c1' } }))

    const [r1, r2] = await Promise.all([p1, p2])
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(r1).toEqual(r2)
  })

  it('404 real: devuelve ok:false con status 404 y no cachea (siguiente llamada reintenta)', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(404, { success: false }))
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { success: true, cliente: { id: 'c1' } }))

    const first = await loadClienteDetail('c1')
    expect(first).toEqual({ ok: false, status: 404, error: 'Cliente no encontrado.' })

    const second = await loadClienteDetail<{ id: string }>('c1')
    expect(second).toEqual({ ok: true, cliente: { id: 'c1' } })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('error de red (no 404): status 0, mensaje distinto al de "no encontrado"', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('network down'))

    const result = await loadClienteDetail('c1')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(0)
      expect(result.error).not.toMatch(/no encontrado/i)
    }
  })

  it('fetchClienteDetailFresh siempre pega a la red (cache: no-store), incluso con caché fresco', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { success: true, cliente: { id: 'c1', direccion: 'Calle 1' } }))
    await loadClienteDetail('c1')
    expect(mockFetch).toHaveBeenCalledTimes(1)

    mockFetch.mockResolvedValueOnce(jsonResponse(200, { success: true, cliente: { id: 'c1', direccion: 'Calle 2' } }))
    const fresh = await fetchClienteDetailFresh<{ id: string; direccion: string }>('c1')

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch).toHaveBeenLastCalledWith('/api/clientes/c1', expect.objectContaining({ cache: 'no-store' }))
    expect(fresh).toEqual({ ok: true, cliente: { id: 'c1', direccion: 'Calle 2' } })
  })

  it('warmClienteDetail dispara el fetch sin que el caller tenga que esperar la promesa', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { success: true, cliente: { id: 'c1' } }))
    warmClienteDetail('c1')
    await Promise.resolve()
    await Promise.resolve()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
