import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCrearPedido, type CrearPedidoPayload } from '@/hooks/use-crear-pedido'

vi.mock('@/lib/fetch-resilient', () => ({
  fetchResilient: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn() },
}))

import { fetchResilient } from '@/lib/fetch-resilient'
const fetchResilientMock = vi.mocked(fetchResilient)

const payload: CrearPedidoPayload = {
  clienteId: 'cliente-1',
  canal: 'DOMICILIO',
  items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
}

describe('useCrearPedido', () => {
  beforeEach(() => {
    fetchResilientMock.mockReset()
  })

  it('llama onSuccess con el pedido creado cuando status es ok', async () => {
    fetchResilientMock.mockResolvedValueOnce({
      status: 'ok',
      statusCode: 201,
      data: { success: true, pedido: { id: 'p1' } },
    })
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useCrearPedido({ onSuccess }))

    await act(async () => {
      await result.current.create(payload)
    })

    expect(onSuccess).toHaveBeenCalledWith({ pedido: { id: 'p1' }, clienteId: 'cliente-1', deduped: false })
  })

  it('llama onOffline con el localId y el payload original cuando fetchResilient encola offline (bug Aponte, pero para pedidos)', async () => {
    fetchResilientMock.mockResolvedValueOnce({
      status: 'offline',
      localId: 'offline-uuid-123',
      reason: 'network',
    })
    const onOffline = vi.fn()
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useCrearPedido({ onSuccess, onOffline }))

    let returned: unknown
    await act(async () => {
      returned = await result.current.create(payload)
    })

    expect(returned).toBeNull()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onOffline).toHaveBeenCalledWith({ localId: 'offline-uuid-123', payload })
  })

  it('no llama onOffline cuando el status es error (falla de validación del server)', async () => {
    fetchResilientMock.mockResolvedValueOnce({
      status: 'error',
      statusCode: 400,
      error: 'Agrega al menos un producto',
    })
    const onOffline = vi.fn()
    const onError = vi.fn()
    const { result } = renderHook(() => useCrearPedido({ onOffline, onError }))

    await act(async () => {
      await result.current.create(payload)
    })

    expect(onOffline).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith('Agrega al menos un producto')
  })

  it('funciona sin onOffline configurado (opcional, backward compatible)', async () => {
    fetchResilientMock.mockResolvedValueOnce({
      status: 'offline',
      localId: 'offline-uuid-456',
      reason: 'timeout',
    })
    const { result } = renderHook(() => useCrearPedido())

    await expect(
      act(async () => {
        await result.current.create(payload)
      }),
    ).resolves.not.toThrow()
  })

  describe('clave de idempotencia por borrador (plan integridad §5.B)', () => {
    it('reusa el offlineId del borrador en cada envío, en vez de generar uno por llamada', async () => {
      fetchResilientMock
        .mockResolvedValueOnce({ status: 'error', statusCode: 500, error: 'Error interno' })
        .mockResolvedValueOnce({ status: 'ok', statusCode: 200, data: { success: true, pedido: { id: 'p1', numero: 285 }, deduped: true } })
      const { result } = renderHook(() => useCrearPedido())

      await act(async () => { await result.current.create({ ...payload, offlineId: 'clave-borrador' }) })
      await act(async () => { await result.current.create({ ...payload, offlineId: 'clave-borrador' }) })

      const claves = fetchResilientMock.mock.calls.map((c) => (c[1].body as { offlineId: string }).offlineId)
      expect(claves).toEqual(['clave-borrador', 'clave-borrador'])
    })

    it('expone deduped cuando el servidor devolvió el pedido ya existente', async () => {
      fetchResilientMock.mockResolvedValueOnce({
        status: 'ok', statusCode: 200, data: { success: true, pedido: { id: 'p1', numero: 285 }, deduped: true },
      })
      const { result } = renderHook(() => useCrearPedido())
      let r: unknown
      await act(async () => { r = await result.current.create({ ...payload, offlineId: 'k' }) })
      expect(r).toEqual({ pedido: { id: 'p1', numero: 285 }, clienteId: 'cliente-1', deduped: true })
    })

    it('sin offlineId del borrador genera una clave por llamada (compatibilidad)', async () => {
      fetchResilientMock.mockResolvedValue({ status: 'ok', statusCode: 201, data: { success: true, pedido: { id: 'p' } } })
      const { result } = renderHook(() => useCrearPedido())
      await act(async () => { await result.current.create(payload) })
      await act(async () => { await result.current.create(payload) })
      const [a, b] = fetchResilientMock.mock.calls.map((c) => (c[1].body as { offlineId: string }).offlineId)
      expect(a).toBeTruthy()
      expect(a).not.toBe(b)
    })
  })
})
