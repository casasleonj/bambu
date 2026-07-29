import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  loadClienteStats,
  loadClienteHistorial,
  peekClienteStats,
  peekClienteHistorial,
  prefetchClientePanel,
  invalidateClientePanelCaches,
  __resetPanelCaches,
} from '../panel-prefetch'
import type { ClienteStats } from '../types'

const STATS_STUB: ClienteStats = {
  totalComprado: 1000,
  totalPagado: 800,
  totalFiado: 200,
  cantidadPedidos: 3,
  cantidadPedidosUltimos30: 1,
  cantidadPedidosUltimos90: 2,
  promedioPorPedido: 333,
  frecuenciaRealDias: 7,
  productosFavoritos: [],
  evolucionMensual: [],
  metodosPago: [],
  diasPromedioPago: null,
}

const HISTORIAL_STUB = {
  events: [{ id: 'pedido-1', tipo: 'PEDIDO', fecha: '2026-07-01', titulo: 'Pedido #1' }],
  total: 1,
  page: 1,
  pageSize: 20,
  hasMore: false,
}

function mockFetchOnce(payload: unknown, ok = true) {
  return vi.fn().mockResolvedValueOnce({
    ok,
    json: () => Promise.resolve(payload),
  } as Response)
}

describe('panel-prefetch', () => {
  beforeEach(() => {
    __resetPanelCaches()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('loadClienteStats fetchea y cachea; segunda llamada dentro del TTL no refetchea', async () => {
    const fetchMock = mockFetchOnce({ success: true, stats: STATS_STUB })
    vi.stubGlobal('fetch', fetchMock)

    const first = await loadClienteStats('c1')
    expect(first).toEqual(STATS_STUB)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const second = await loadClienteStats('c1')
    expect(second).toEqual(STATS_STUB)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('dedup: dos llamadas concurrentes comparten una sola promesa/fetch', async () => {
    let resolveFetch: ((v: unknown) => void) | null = null
    const fetchMock = vi.fn().mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const p1 = loadClienteStats('c1')
    const p2 = loadClienteStats('c1')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveFetch!({ ok: true, json: () => Promise.resolve({ success: true, stats: STATS_STUB }) })
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toEqual(STATS_STUB)
    expect(r2).toEqual(STATS_STUB)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('los fallos devuelven null y NO quedan cacheados (el siguiente intento refetchea)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, stats: STATS_STUB }) })
    vi.stubGlobal('fetch', fetchMock)

    const failed = await loadClienteStats('c1')
    expect(failed).toBeNull()
    expect(peekClienteStats('c1')).toBeNull()

    const retried = await loadClienteStats('c1')
    expect(retried).toEqual(STATS_STUB)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('body con success:false se trata como fallo (null, sin cachear)', async () => {
    const fetchMock = mockFetchOnce({ success: false, error: { message: 'boom' } })
    vi.stubGlobal('fetch', fetchMock)

    expect(await loadClienteStats('c1')).toBeNull()
    expect(peekClienteStats('c1')).toBeNull()
  })

  it('fetch que lanza (offline) devuelve null sin cachear', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetchMock)

    expect(await loadClienteStats('c1')).toBeNull()
    expect(peekClienteStats('c1')).toBeNull()
  })

  it('TTL: después de 60s vuelve a fetchear', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true, stats: STATS_STUB }) })
    vi.stubGlobal('fetch', fetchMock)

    await loadClienteStats('c1')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(59_000)
    await loadClienteStats('c1')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(2_000)
    await loadClienteStats('c1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('LRU: al superar el máximo, expulsa la entrada más vieja', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true, stats: STATS_STUB }) })
    vi.stubGlobal('fetch', fetchMock)

    // 20 entradas llenan la caché
    for (let i = 0; i < 20; i++) {
      await loadClienteStats(`c${i}`)
    }
    expect(peekClienteStats('c0')).not.toBeNull()

    // La 21ra expulsa c0 (la más vieja)
    await loadClienteStats('c20')
    expect(peekClienteStats('c0')).toBeNull()
    expect(peekClienteStats('c20')).not.toBeNull()
  })

  it('loadClienteHistorial cachea solo la vista default y peek la lee', async () => {
    const fetchMock = mockFetchOnce({ success: true, ...HISTORIAL_STUB })
    vi.stubGlobal('fetch', fetchMock)

    const page = await loadClienteHistorial('c1')
    expect(page?.events).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/clientes/c1/historial?meses=12&page=1&pageSize=20')

    const peeked = peekClienteHistorial('c1')
    expect(peeked?.hasMore).toBe(false)
    expect(peeked?.events[0].titulo).toBe('Pedido #1')
  })

  it('prefetchClientePanel dispara ambas cargas (stats + historial)', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/stats')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, stats: STATS_STUB }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, ...HISTORIAL_STUB }) })
    })
    vi.stubGlobal('fetch', fetchMock)

    prefetchClientePanel('c1')
    // Esperar a que ambas promesas en vuelo resuelvan
    await loadClienteStats('c1')
    await loadClienteHistorial('c1')

    const urls = fetchMock.mock.calls.map((c) => c[0] as string)
    expect(urls).toContain('/api/clientes/c1/stats')
    expect(urls).toContain('/api/clientes/c1/historial?meses=12&page=1&pageSize=20')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('invalidateClientePanelCaches limpia ambas cachés', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/stats')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, stats: STATS_STUB }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, ...HISTORIAL_STUB }) })
    })
    vi.stubGlobal('fetch', fetchMock)

    await loadClienteStats('c1')
    await loadClienteHistorial('c1')
    expect(peekClienteStats('c1')).not.toBeNull()
    expect(peekClienteHistorial('c1')).not.toBeNull()

    invalidateClientePanelCaches()
    expect(peekClienteStats('c1')).toBeNull()
    expect(peekClienteHistorial('c1')).toBeNull()

    // Tras invalidar, la próxima carga refetchea
    await loadClienteStats('c1')
    expect(fetchMock.mock.calls.filter((c) => (c[0] as string).includes('/stats'))).toHaveLength(2)
  })
})
