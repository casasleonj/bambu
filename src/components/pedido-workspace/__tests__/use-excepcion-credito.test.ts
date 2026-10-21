import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useExcepcionCredito } from '../use-excepcion-credito'

const params = { motivo: 'paga el viernes', nota: '', total: 30000, totalPagado: 0 }

function detalle(estado: string, extra: Record<string, unknown> = {}) {
  return { ok: true, json: async () => ({ success: true, excepcion: { id: 'e1', estado, motivoSolicitud: 'paga el viernes', operacionSaldoSnapshot: 30000, ...extra } }) }
}

describe('useExcepcionCredito', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock) })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('solicitar: POST con clienteId, motivo, operación y clave; queda PENDIENTE', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, id: 'e1', estado: 'PENDIENTE', deduped: false }) })
    const { result } = renderHook(() => useExcepcionCredito('c1'))
    await act(async () => { await result.current.solicitar(params) })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/pedidos/excepciones-credito')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ clienteId: 'c1', motivoSolicitud: 'paga el viernes', operacion: { total: 30000, totalPagado: 0 } })
    expect(body.offlineId).toBeTruthy()
    expect(result.current.excepcion).toMatchObject({ id: 'e1', estado: 'PENDIENTE' })
  })

  it('sin conexión: error claro, no hay solicitud y el reintento usa la MISMA clave', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, id: 'e1', estado: 'PENDIENTE', deduped: true }) })
    const { result } = renderHook(() => useExcepcionCredito('c1'))
    await act(async () => { await result.current.solicitar(params) })
    expect(result.current.error).toMatch(/Sin conexión/)
    expect(result.current.excepcion).toBeNull()
    await act(async () => { await result.current.solicitar(params) })
    const claves = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).offlineId)
    expect(claves[0]).toBe(claves[1])
  })

  it('error del servidor: muestra su mensaje', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ success: false, error: { message: 'El cliente no está sobre el límite' } }) })
    const { result } = renderHook(() => useExcepcionCredito('c1'))
    await act(async () => { await result.current.solicitar(params) })
    expect(result.current.error).toBe('El cliente no está sobre el límite')
  })

  it('pendiente → consulta cada 10 s y al autorizarse avisa con el id', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, id: 'e1', estado: 'PENDIENTE', deduped: false }) })
    const onAutorizada = vi.fn()
    const { result } = renderHook(() => useExcepcionCredito('c1', { onAutorizada }))
    await act(async () => { await result.current.solicitar(params) })

    fetchMock.mockResolvedValueOnce(detalle('PENDIENTE'))
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(onAutorizada).not.toHaveBeenCalled()
    expect(result.current.excepcion?.estado).toBe('PENDIENTE')

    fetchMock.mockResolvedValueOnce(detalle('AUTORIZADA', { autorizadoPor: { nombre: 'Ana' } }))
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(onAutorizada).toHaveBeenCalledWith('e1')
    expect(result.current.excepcion).toMatchObject({ estado: 'AUTORIZADA', autorizadoPorNombre: 'Ana', saldoAutorizado: 30000 })

    // resuelta → deja de consultar
    const llamadas = fetchMock.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(fetchMock.mock.calls.length).toBe(llamadas)
  })

  it('rechazada: guarda la nota; pedir otra usa una clave NUEVA', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, id: 'e1', estado: 'PENDIENTE', deduped: false }) })
    const { result } = renderHook(() => useExcepcionCredito('c1'))
    await act(async () => { await result.current.solicitar(params) })
    fetchMock.mockResolvedValueOnce(detalle('RECHAZADA', { rechazadoPor: { nombre: 'Ana' }, notaRechazo: 'paga lo vencido' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(result.current.excepcion).toMatchObject({ estado: 'RECHAZADA', notaRechazo: 'paga lo vencido' })

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, id: 'e2', estado: 'PENDIENTE', deduped: false }) })
    await act(async () => { await result.current.solicitar(params) })
    const claves = fetchMock.mock.calls.filter((c) => c[0] === '/api/pedidos/excepciones-credito').map((c) => JSON.parse(c[1].body).offlineId)
    expect(claves[0]).not.toBe(claves[1])
    expect(result.current.excepcion?.id).toBe('e2')
  })

  it('al cambiar de cliente se descarta la solicitud', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, id: 'e1', estado: 'PENDIENTE', deduped: false }) })
    const { result, rerender } = renderHook(({ id }) => useExcepcionCredito(id), { initialProps: { id: 'c1' as string | null } })
    await act(async () => { await result.current.solicitar(params) })
    expect(result.current.excepcion).not.toBeNull()
    rerender({ id: 'c2' })
    await waitFor(() => expect(result.current.excepcion).toBeNull())
  })

  it('reiniciar descarta la solicitud', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, id: 'e1', estado: 'PENDIENTE', deduped: false }) })
    const { result } = renderHook(() => useExcepcionCredito('c1'))
    await act(async () => { await result.current.solicitar(params) })
    act(() => result.current.reiniciar())
    expect(result.current.excepcion).toBeNull()
  })
})
