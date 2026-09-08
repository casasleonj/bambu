import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/lib/fetch-resilient', () => ({ fetchResilient: vi.fn() }))
import { fetchResilient } from '@/lib/fetch-resilient'
import { useAjusteCantidad } from '../use-ajuste-cantidad'

const frMock = vi.mocked(fetchResilient)

const proy = (over: Record<string, unknown> = {}) => ({
  success: true, producto: 'PACA_AGUA', cantidadOriginal: 10, cantidadEntregada: 0,
  cantidadNueva: 12, delta: 2, precioHistorico: 2000, subtotalAntes: 20000, subtotalDespues: 24000,
  totalAntes: 20000, totalDespues: 24000, totalPagado: 5000, saldoAntes: 15000, saldoDespues: 19000,
  estadoEntrega: 'PENDIENTE', estadoPagoAntes: 'PARCIAL', estadoPagoDespues: 'PARCIAL',
  sobrepagoProyectado: 0, bloqueadoPor: null, warnings: [], allowedActions: ['confirmar-correccion'],
  puedeCorregir: true, ...over,
})

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  frMock.mockReset()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('useAjusteCantidad', () => {
  it('proyectar → guarda la proyección desde /preview', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => proy() })
    const { result } = renderHook(() => useAjusteCantidad('p1', vi.fn()))
    await act(async () => { await result.current.proyectar({ producto: 'PACA_AGUA', cantidadNueva: 12 }) })
    expect(result.current.proyeccion?.totalDespues).toBe(24000)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/pedidos/p1/ajustar-cantidad/preview')
  })

  it('stale-guard: la proyección obsoleta que resuelve última NO pisa a la vigente', async () => {
    const resolvers: Array<(v: unknown) => void> = []
    fetchMock.mockImplementation(() => new Promise((res) => { resolvers.push(res) }))
    const { result } = renderHook(() => useAjusteCantidad('p1', vi.fn()))
    let p1!: Promise<void>, p2!: Promise<void>
    act(() => { p1 = result.current.proyectar({ producto: 'PACA_AGUA', cantidadNueva: 11 }) })
    act(() => { p2 = result.current.proyectar({ producto: 'PACA_AGUA', cantidadNueva: 20 }) })
    await act(async () => {
      resolvers[1]({ ok: true, status: 200, json: async () => proy({ cantidadNueva: 20, totalDespues: 40000 }) })
      resolvers[0]({ ok: true, status: 200, json: async () => proy({ cantidadNueva: 11, totalDespues: 22000 }) })
      await p2; await p1
    })
    expect(result.current.proyeccion?.totalDespues).toBe(40000)
  })

  it('confirmar OK → limpia y llama onMutado', async () => {
    frMock.mockResolvedValue({ status: 'ok', statusCode: 201, data: { success: true } })
    const onMutado = vi.fn()
    const { result } = renderHook(() => useAjusteCantidad('p1', onMutado))
    let r!: Awaited<ReturnType<typeof result.current.confirmar>>
    await act(async () => { r = await result.current.confirmar({ producto: 'PACA_AGUA', cantidadNueva: 12, motivo: 'error de captura' }) })
    expect(r.ok).toBe(true)
    expect(onMutado).toHaveBeenCalled()
    expect(frMock.mock.calls[0][0]).toBe('/api/pedidos/p1/ajustar-cantidad')
  })

  it('confirmar → 409 con guard en el mensaje → devuelve guard, NO llama onMutado', async () => {
    frMock.mockResolvedValue({
      status: 'error', statusCode: 409,
      error: 'CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA: detalle',
    })
    const onMutado = vi.fn()
    const { result } = renderHook(() => useAjusteCantidad('p1', onMutado))
    let r!: Awaited<ReturnType<typeof result.current.confirmar>>
    await act(async () => { r = await result.current.confirmar({ producto: 'PACA_AGUA', cantidadNueva: 12, motivo: 'x' }) })
    expect(r.ok).toBe(false)
    expect(r.guard).toBe('CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA')
    expect(onMutado).not.toHaveBeenCalled()
  })

  it('confirmar → error 500 (no 409) → sin guard', async () => {
    frMock.mockResolvedValue({ status: 'error', statusCode: 500, error: 'Error ajustando cantidad de pedido' })
    const { result } = renderHook(() => useAjusteCantidad('p1', vi.fn()))
    let r!: Awaited<ReturnType<typeof result.current.confirmar>>
    await act(async () => { r = await result.current.confirmar({ producto: 'PACA_AGUA', cantidadNueva: 12, motivo: 'x' }) })
    expect(r.ok).toBe(false)
    expect(r.guard).toBeUndefined()
  })

  it('confirmar offline → ok:true offline:true, llama onMutado', async () => {
    frMock.mockResolvedValue({ status: 'offline', localId: 'uuid-1', reason: 'network' })
    const onMutado = vi.fn()
    const { result } = renderHook(() => useAjusteCantidad('p1', onMutado))
    let r!: Awaited<ReturnType<typeof result.current.confirmar>>
    await act(async () => { r = await result.current.confirmar({ producto: 'PACA_AGUA', cantidadNueva: 12, motivo: 'x' }) })
    expect(r.ok).toBe(true)
    expect(r.offline).toBe(true)
    expect(onMutado).toHaveBeenCalled()
  })
})
