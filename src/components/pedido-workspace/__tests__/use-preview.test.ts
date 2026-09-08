import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePreview } from '../use-preview'
import type { DraftPedido } from '../types'

const draft = (over: Partial<DraftPedido> = {}): DraftPedido => ({
  clienteId: 'c1', negocioId: null, canal: 'DOMICILIO', origen: 'PEDIDO',
  items: [{ producto: 'PACA_AGUA', cantidad: 5 }], pagos: [], ...over,
})

const okResponse = () => ({
  ok: true,
  json: async () => ({
    success: true,
    calculation: { items: [], subtotal: 0, recargoDomicilio: 0, total: 12500, totalPagado: 0, saldoProyectado: 12500, saldoFavorProyectado: 0, estadoEntregaProyectado: 'PENDIENTE', estadoPagoProyectado: 'PENDIENTE' },
    permissions: { canCreate: true, canSetManualPrice: true },
    allowedActions: ['crear'], warnings: [], riskSignals: [], requiresAuthorization: false,
    auditPreview: { actor: 'u', accion: 'CREAR_PEDIDO', recurso: 'Pedido (nuevo)', valoresRelevantes: { total: 12500, clienteId: 'c1', canal: 'DOMICILIO', origen: 'PEDIDO', tienePrecioManual: false } },
  }),
})

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('usePreview', () => {
  it('no pide preview si falta cliente o items', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const cb = { onPending: vi.fn(), onReceived: vi.fn(), onError: vi.fn() }
    renderHook(() => usePreview(draft({ clienteId: null }), cb))
    vi.advanceTimersByTime(1000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('debounce ~400ms, luego POST /api/pedidos/preview y onReceived', async () => {
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const cb = { onPending: vi.fn(), onReceived: vi.fn(), onError: vi.fn() }
    renderHook(() => usePreview(draft(), cb))

    vi.advanceTimersByTime(399)
    expect(fetchMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5)
    expect(fetchMock).toHaveBeenCalledWith('/api/pedidos/preview', expect.objectContaining({ method: 'POST' }))
    expect(cb.onPending).toHaveBeenCalled()
    // flush del await res.json() y del callback
    await vi.advanceTimersByTimeAsync(0)
    expect(cb.onReceived).toHaveBeenCalled()
    expect(cb.onReceived.mock.calls[0][0].calculation.total).toBe(12500)
  })

  it('un cambio de draft aborta el request anterior', async () => {
    const aborts: string[] = []
    const fetchMock = vi.fn((url: string, opts: { signal: AbortSignal }) => {
      opts.signal.addEventListener('abort', () => aborts.push(url))
      return new Promise(() => {}) // nunca resuelve
    })
    vi.stubGlobal('fetch', fetchMock)
    const cb = { onPending: vi.fn(), onReceived: vi.fn(), onError: vi.fn() }
    const { rerender } = renderHook(({ d }) => usePreview(d, cb), { initialProps: { d: draft() } })
    await vi.advanceTimersByTimeAsync(401)
    rerender({ d: draft({ items: [{ producto: 'PACA_AGUA', cantidad: 9 }] }) })
    await vi.advanceTimersByTimeAsync(401)
    expect(aborts.length).toBeGreaterThanOrEqual(1)
  })

  it('offline → onError NETWORK_ERROR (no rompe)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const cb = { onPending: vi.fn(), onReceived: vi.fn(), onError: vi.fn() }
    renderHook(() => usePreview(draft(), cb))
    await vi.advanceTimersByTimeAsync(405)
    await vi.advanceTimersByTimeAsync(0)
    expect(cb.onError).toHaveBeenCalledWith('NETWORK_ERROR', expect.any(String))
  })
})
