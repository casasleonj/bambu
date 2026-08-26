/**
 * Tests for fetchBaseCajaStatus — el fetch compartido de cierre/last +
 * config?clave=BASE_DIA_<today> que usan CajaBaseHeader y BaseCajaModal.
 *
 * Foco: (1) pega a las dos URLs correctas, (2) deduplica llamadas
 * concurrentes con el mismo `today` (mismo tick síncrono), (3) NO deduplica
 * llamadas separadas por un await (para no quedar "pegado" a una respuesta
 * vieja indefinidamente).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchBaseCajaStatus } from '@/lib/client/base-caja-status'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchBaseCajaStatus', () => {
  it('pega a /api/cierre/last y /api/config?clave=BASE_DIA_<today>', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ config: { valor: '50000' } }) })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchBaseCajaStatus('2026-08-26')

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/cierre/last')
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/config?clave=BASE_DIA_2026-08-26')
    expect(result).toEqual({ cierre: null, configHoy: { valor: '50000' } })
  })

  it('trata un 404/no-ok como "sin dato" en vez de lanzar', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchBaseCajaStatus('2026-08-26')
    expect(result).toEqual({ cierre: null, configHoy: null })
  })

  it('deduplica dos llamadas concurrentes con el mismo today: solo 2 fetch en total', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ config: null }) })
    vi.stubGlobal('fetch', fetchMock)

    // Dos consumidores (CajaBaseHeader + BaseCajaModal) llamando en el mismo
    // tick, como pasa cuando ambos montan desde el mismo layout.
    const [a, b] = await Promise.all([
      fetchBaseCajaStatus('2026-08-26'),
      fetchBaseCajaStatus('2026-08-26'),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(a).toEqual(b)
  })

  it('NO deduplica llamadas separadas por un await: cada una dispara su propio fetch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ cierre: null }) })
    vi.stubGlobal('fetch', fetchMock)

    await fetchBaseCajaStatus('2026-08-26')
    await fetchBaseCajaStatus('2026-08-26')

    // 2 llamadas x 2 fetch (cierre + config) = 4. Si el cache quedara
    // "pegado" indefinidamente, la segunda invocación no dispararía fetch
    // nuevo y este assert fallaría.
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('no deduplica entre `today` distintos', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ cierre: null }) })
    vi.stubGlobal('fetch', fetchMock)

    await Promise.all([
      fetchBaseCajaStatus('2026-08-26'),
      fetchBaseCajaStatus('2026-08-27'),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
